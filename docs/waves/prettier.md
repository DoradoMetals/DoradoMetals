# Prettier hook + the one-time repo-wide format

`prettier-hook` (f2999b2e) added the config and the commit-time gate; this
wave brings it in, decides the swept file set, teaches the contracts
generator to emit code the hook will never re-touch, and runs the sweep.

## File set

Code only, swept from the worktree root:

```
*.{ts,tsx,js,mjs,cjs,json,css,yaml,yml}
```

under the root, `api/`, `packages/`, `frontend/`, `scripts/`, `.claude/`.
`lint-staged`'s glob in `package.json` matches the same set so a commit never
formats what the sweep did not.

**Excluded, via `.prettierignore`:**

- `*.md` - prose stays as written. This also keeps `FOLLOWUPS.md` untouched by
  any future hook run without a special case for that one file.
- `*.sql` - not just `api/migrations/*.sql`: `000_genesis_schema.sql` is
  compared byte-for-byte to a live regeneration
  (`api/scripts/verify-genesis.mjs`), and reformatting it would only
  manufacture a diff against that regeneration for no reason. No other `.sql`
  in the tree needs formatting either.
- `api/tests/cassettes/` - recorded HTTP fixtures (FedEx, Places, Stripe).
  Data, not code.
- `.github/` - CI workflow config sits outside the six swept locations named
  above; left alone on purpose rather than swept as a root-adjacent yaml file.
- The usual `node_modules`, `dist`, `.next`, `coverage`, `.check-logs`,
  `pnpm-lock.yaml`.

The held branch's original `.prettierignore` carried
`packages/contracts/src/generated/` and a blanket `.claude/` exclusion. Both
were stale: nothing lives at that `generated/` path (the entity split put a
`// generated:start` … `// generated:end` region inline in every
`src/<schema>/<table>.ts`, mixed with hand-written derivations), and `.claude/`
holds real swept code (`settings.json`, `tmp/strip-comments.mjs`) beside
markdown that `*.md` already excludes. Both lines were dropped rather than
carried forward.

## Generated regions: the generator route, not an exemption

`packages/contracts/src/**` mixes a generator-owned region with hand-written
derivations in the same file. Ignoring the whole file was never on the table -
that would exempt real code from the hook. Making the *generator* emit
prettier-formatted output was the only route that keeps `verify:fresh` (which
diffs a fresh regeneration against the committed file, region-for-region)
agreeing with itself forever, instead of fighting every future `prettier
--write`.

`packages/contracts/scripts/generate-entities.mjs` now runs every region (and
every fully-generated file - `enums.ts`, a schema's `index.ts`, `schemas.ts`)
through `prettier.format()` before writing:

- **Config is resolved from the script's own path**
  (`packages/contracts/scripts/`), never from `OUTDIR`. `verify:fresh` points
  `OUTDIR` at a scratch directory under `os.tmpdir()` with no `.prettierrc`
  above it in the tree; resolving from there would silently fall back to
  prettier's defaults and never match the committed, repo-formatted file.
- **A table's region is formatted in isolation**, not as part of the merged
  file. It's spliced between hand-written derivations that already went
  through the same hook, and formatting it standalone makes the formatted
  region a pure function of the schema data alone - byte-identical whether it
  lands beside real derivations (the committed file) or beside the
  placeholder comment `verify:fresh`'s fresh generation writes into an empty
  scratch file. That's exactly the invariant the region comparison needs.
- **`quoteProps: "preserve"`**, pinned in `.prettierrc`'s `overrides` for
  `packages/contracts/src/**/*.ts` (not just inside the generator - see next
  section for why that doubling mattered) - so a column key that happens to
  be a valid identifier (`id`, `order_id`, ...) keeps its quotes instead of
  prettier's default `"as-needed"` stripping them. Three lints
  (`lint-domain-boundaries.ts`, `lint-no-column-arrays.ts`) scan the generated
  region by matching `"column_name":` at the start of a line; unquoted keys
  make every column invisible to that scan.

`pnpm --filter @dorado/contracts generate` + `build` + `verify:fresh` all pass
clean: 74 generated files compared, all match.

### The config had to be persistent, not just inside the generator

First pass only set `quoteProps: "preserve"` inside the generator's own
`prettier.format()` call. That's necessary but not sufficient: proving the
hook (`.husky/pre-commit` → `lint-staged` → `prettier --write` over every
staged file) re-ran plain `prettier --write` against the whole staged tree,
including `packages/contracts/src/**`, using only `.prettierrc`'s config -
which at that point had no `quoteProps` override at all. Default
`"as-needed"` stripped every valid-identifier key's quotes right back off,
and `lint-domain-boundaries`, `lint-no-column-arrays` and
`contracts:verify:fresh` all failed again. Fixed by moving the override into
`.prettierrc` itself as a file-glob override
(`files: "packages/contracts/src/**/*.ts"`), so the CLI, the hook, and the
generator all resolve the same `quoteProps: "preserve"` for these files -
"the hook can never fight the generator" only holds if the hook's own config
agrees with the generator's.

## The sweep

`prettier --write` over the file set above: **1080 files changed** (591
`api/`, 265 `packages/`, 214 `frontend/`, 8 `scripts/`, plus the root-level
`docker-compose.yml` and `.mcp.json`, and `.claude/settings.json` +
`.claude/tmp/strip-comments.mjs`). No `.md`, `.sql`, cassette or lockfile
touched - verified by diffing the changed-file list against those patterns
after the sweep.

## Checks broken by formatting alone, and fixed (never exempted)

Several static-analysis scripts under `api/scripts/` parse source text with
regexes that assumed the pre-hook style (double quotes, semicolons). Formatting
didn't change behavior anywhere; it changed the literal characters these
lints pattern-match on. Each was a real bug in the *lint*, fixed there:

- **`lint-imports.mjs`** - `stripComments()` preserved string bodies verbatim
  (correct - a real import specifier's string lives inside `from "..."`), but
  that meant a self-test fixture's fake import
  (`'... from "#db/x/repo.ts"; ...'`, one string deep, meant as data for a
  nested test harness) went from double-escaped (`\"..\"`, invisible to the
  specifier regex because a backslash isn't a quote character) to plainly
  quoted the moment its outer delimiter became a single quote - and read as a
  second, real import. Fixed by tracking whether a string literal is actually
  the argument to `from`/`import(` before letting its body stay visible to the
  specifier scan; any other string's body is now blanked (space-filled, same
  length) so nested fixture text can't be mistaken for code, independent of
  quote style. 9 unresolved → 0.
- **`lint-row-vs-list.ts`** - `/return\s+(?:\w+\.)?rows\s*;/` required the
  semicolon `semi: false` removed. Made optional. 0 known list-returning
  functions → 78 (40 features).
- **`lint-domain-boundaries.ts`**, **`lint-no-column-arrays.ts`** - see
  quoteProps above; both scanned generated regions for `"column_name":` and
  needed `["']` instead of a hardcoded `"`.
- **`lint-type-homes.ts`** - the `type X = ...` body scanner looked for a
  terminating `;` at bracket-depth 0; with no semicolons left anywhere, an
  unbracketed declaration (a union of string literals, `type EmailKind = | 'a'
  | 'b' | ...`) never found one and the scan ran to end-of-file. A body that
  long tests true against `DERIVING` (`Record`, `keyof`, ...) almost by
  accident, silently dropping every type declaration in the file after the
  first. Fixed with an ASI-aware stop condition: at a depth-0 newline, look at
  the trailing character before it and the leading character after it for a
  union/intersection continuation (`|`, `&`, or a still-open `=`/`(`/`{`/`,`);
  stop only when neither side continues. `media/emails/record.ts` (`1/4` →
  `4/4`) and `media/pdfs/serve.ts` (`1/3` → `3/3`) recovered their pinned
  counts.
- **`audit-silent-mutations.ts`** - `await x.y(...)` was matched per-LINE at
  the start of the line, with no check for whether that line merely continues
  a still-open argument list from the line above. Prettier's arg-per-line
  wrapping under `printWidth: 100` put exactly one previously-safe call
  (`assertCreditSubject(user_id, await users.adjustCredit(...))` in
  `payments/credit/service.ts`) on its own line, and it read as a bare,
  discarded statement. Fixed by checking the previous non-blank line's
  trailing character; a call continuing an open `(`, `[` or trailing `,` is
  never counted, formatting-caused or not. 15 discarded (ceiling 14) → 14.

Every fix above has a passing `--self-test` for the script it lives in
(`lint-imports.mjs` 6/6, `lint-row-vs-list.ts`, `lint-domain-boundaries.ts`
14/14, `lint-no-column-arrays.ts` 11/11, `lint-type-homes.ts` 14/14,
`audit-silent-mutations.ts` 4/4), so the fix is pinned against regressing the
same way again.

## Gate result

`pnpm check`: **green except the pre-existing `figma:inventory`** (Figma
design-sync drift - unrelated to this branch, Jacob's to resolve). All 22
`api:lint:*` steps, `api:test` (coverage), `api:typecheck`,
`api:audit:silent-mutations`, `components:typecheck`/`test`,
`client:typecheck`/`test`, `contracts:verify:fresh`/`validate`,
`api:verify:genesis`, `api:verify:backfill`, `api:validate:wire`, and every
`api:audit:*` in the `dev-db` group pass. Lints with floors count files, not
lines - none moved.

Also run (not part of this branch's gate):

- `pnpm --filter @dorado/frontend typecheck` - clean.
- `pnpm --filter @dorado/frontend test` - 30 files, 154 tests, all pass.
- `pnpm --filter @dorado/frontend build` - succeeds, all routes prerender.
- `pnpm --filter @dorado/api lint:client-boundary` - 341 frontend files, 44
  client files, 0 findings.

## Hook proven

Staged a deliberately mis-formatted file
(`api/scripts/tmp-hook-proof/messy.ts` - inconsistent spacing, double quotes,
semicolons), ran `.husky/pre-commit` directly. `lint-staged` invoked
`prettier --write`, the file came back correctly formatted (single quotes, no
semicolons, normalized spacing), exit 0. Proof file removed afterward
(`git rm --cached` + `rm`, never committed). Re-running the same proof a
second time - after `packages/contracts/src` had drifted back to unquoted
keys from the first run - is what surfaced the missing persistent
`quoteProps` override above; after fixing it, `pnpm exec prettier --check
packages/contracts/src/**/*.ts` reports clean, so a future hook run won't
strip the quotes again.

## What's staged, not committed

The merge (`f2999b2e` into `prettier-lane`) plus the sweep plus every lint
fix above are staged and uncommitted, per instructions - `git merge
--continue` / the commit is Jacob's.
