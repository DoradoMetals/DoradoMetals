# Comment purge — ruling 54

Jacob (verbatim): *"don't add any comments unless it's fucking crucial and
they're VERY short."* Applied retroactively to the existing tree: `api/**`
(`.ts`, `.mjs`, `.sql`, excluding `api/migrations/**`, which is history),
`packages/contracts/**` (`.ts`) and `packages/client/**` (`.ts`). Not
`frontend/**`, not `packages/components/**`, not `docs/**`.

Done mechanically: a hand-rolled tokenizer (not a regex-strip) walks every
file tracking string/template-literal/regex-literal state so a `//` inside a
string or a `/*` inside a regex survives, removes every comment except a small
allowlist, then collapses the blank lines the removal leaves. Script and
tests: `api/scripts/lint-*` and the guard files it depends on were read first
to enumerate every marker a lint parses from source, so nothing load-bearing
was removed blind.

**TypeScript 7's npm package no longer ships an in-process parser** — the
root export is version info only; `createSourceFile` and the classic
compiler API now live behind a client-server protocol that spawns a native
binary. Rather than stand that up for a comment pass, the tool is a
character-level scanner (strings, template literals with nested `${}` holes,
regex-literal detection via the standard "previous significant token"
heuristic, line/block comments) validated by 27 unit tests against exactly
the risk cases this matters for, plus an empirical check against this repo's
own regex-heavy lint scripts before it touched anything for real. SQL got its
own small state machine (`--`, `/* */` with nesting, `'...'`/`"..."` with
doubled-quote escaping, `$tag$` bodies).

## Before / after (lines)

| package | | total | comment | blank | code |
|---|---|---:|---:|---:|---:|
| `api/**` (excl. migrations) | before | 79,234 | 16,956 | 8,273 | 54,005 |
| | after | 62,013 | 7 | 8,001 | 54,005 |
| `packages/contracts/**` | before | 4,115 | 1,444 | 385 | 2,286 |
| | after | 3,011 | 399 | 326 | 2,286 |
| `packages/client/**` | before | 2,991 | 737 | 322 | 1,932 |
| | after | 2,231 | 1 | 298 | 1,932 |
| **grand total** | before | **86,340** | **19,137** | 8,980 | 58,223 |
| | after | **67,255** | **407** | 8,625 | 58,223 |

**19,085 lines removed** (before/after total-line delta). Code line counts
are identical before and after in every package — the removal touched
comments and blank-line spacing only.

`git diff --shortstat`: **886 files changed, 71 insertions(+), 19,154
deletions(-)** across 943 files in scope (57 already had zero removable
comments — mostly the contracts barrels below). The small gap between this
and the 19,085 line-count delta is methodology (diff counts changed lines,
not a before/after total-line subtraction) plus the one deliberate 3-line
addition described below.

## What stayed, and why (this list is meant to be short)

**Toolchain directives — 8 lines, auto-detected by pattern, kept verbatim:**

- `api/db/users/tests/repo.test.ts:77`
- `api/domain/orders/tests/address-state.test.ts:73`
- `api/domain/rates/tests/resolveRate.test.ts:59` and `:65`
- `api/domain/shipping/operations/tests/check-pickup-date.test.ts:48`
- `api/domain/users/tests/credit-target.test.ts:57`
  — six `// @ts-expect-error - ...` directives. Each used to sit under
  several lines of prose explaining why; the prose went, the directive (with
  its own one-line reason) stayed since removing it would unsuppress a real
  type error.
- `api/shared/db/columns.ts:3` — `// eslint-disable-next-line
  @typescript-eslint/no-explicit-any`, kept immediately above the line it
  protects.
- `packages/client/src/env.d.ts:1` — `/// <reference types="node" />`, a
  compiler directive.

**`packages/contracts` — 399 lines, all generator-owned, none a narrative
choice:**

- Every entity file's `// generated:start` … `// generated:end` region
  (id, header comment, `generated:end`) is untouched byte-for-byte — the tool
  never edits inside that span. Hand-written derivations below the region had
  their comments stripped normally.
- `schemas.ts` and every `<schema>/index.ts` / `<schema>/enums.ts` are
  **whole-file generated with no hand section** (per
  `scripts/verify-fresh.mjs`'s own definition) and were skipped entirely —
  not because their comments are crucial, but because touching them would
  make them differ from what the generator produces.
- `pnpm --filter @dorado/contracts verify:fresh` (74 generated files compared
  against dev) is what proves this: **0 differences**, both inside regions
  and in the whole-generated files.

Nothing else was judged "crucial" enough to keep by hand. The codebase's
narrative style (history, `D`-numbers, Jacob quotes, wave references,
restated rulings, "here's why this isn't a bug" explanations) is pervasive
enough that hand-picking "traps worth a line" would mean reviewing hundreds
of comparably-argued comments — exactly what the ruling says not to do
("aim for very few... when in doubt, delete"). Git history has all of it.

## One thing verification found, and the fix

`api/shared/http/tests/endpoints.test.ts`'s "every exported controller
handler is routed, or declared unrouted" test decides "routed" by regex-
matching a handler's name against the full text of every `routes.ts` file —
comments included. `api/transport/media/emails/routes.ts` had a comment
mentioning `sendCreatedEmail` by name (explaining it has no route and is
called internally); removing that comment as narrative made the test's own
naive check correctly notice the handler really isn't wired anywhere. Fixed
the intended way — the test already has an escape hatch for exactly this
(`payments/controller.ts`'s `handleStripeWebhook` is in it for the same
reason) — by adding one entry to its `UNROUTED` map:

```
"media/emails/controller.ts": {
  sendCreatedEmail: "only caller is the API itself, not an HTTP route",
},
```

That is a data-structure entry the test defines for this purpose, not a
reinstated comment.

## Verification

| check | result |
|---|---|
| `pnpm --filter @dorado/contracts build` | PASS (exit 0) |
| `pnpm --filter @dorado/contracts verify:fresh` | PASS (exit 0) — 74 generated files compared, all match |
| `pnpm check:fast` | PASS for everything in scope — all `api:lint:*`, `api:typecheck`, `api:test` (221 files, 1312 passed, 1 skipped, 0 failed) green. Only `figma:inventory`/`design` fails, pre-existing and unrelated (`packages/components` Figma-mapping drift) — explicitly excused by this task's own instructions |
| `pnpm --filter @dorado/client typecheck` | PASS (exit 0) |
| `pnpm --filter @dorado/client test` | PASS — 4 files, 26 tests |
| `pnpm --filter @dorado/frontend typecheck` | PASS (exit 0) |

Everything is left uncommitted on `comments-lane`, per instructions.
