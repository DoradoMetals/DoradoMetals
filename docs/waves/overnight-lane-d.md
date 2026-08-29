# Lane D — the tooling nobody typechecks

Scope: `api/scripts/**` and `frontend/scripts/**`. Nothing else.
HEAD at dispatch: `002c0f0f`.

Four gate scripts rotted in two waves (D110, D115, D118, D120). All four are
REPORTS. The things that kept working are ASSERTIONS (D135). This lane converts
reports into assertions, gives every script something that fires, and builds the
meta-guard that makes the class impossible to re-enter silently.

D1. Floors on counting scripts   ████████████████░░   90%
D2. Self-tests, proved by attack   ████████████████░░   90%
D3. The environmental rule   ██████████████████   100%
D4. audit:switches sees a bypass   ██████████████████   100%
D5. The meta-guard   ██████████████████   100%

## *** CORRECTED NUMBER, FOR JACOB — THE TYPOGRAPHY SWEEP IS NOT AT ZERO ***

`frontend/scripts/lint-call-site-styling.mjs` matched three hand-enumerated
spellings of `className`. The tree has **205 call sites spelled
`className={cn(...)}` and not one of them was ever read.** Both of the file's
modes reported zero, and the `--scatter` zero was quoted in a commit message as
evidence the typography sweep was finished. It meant "zero of the ones I can
see". Found by lane C, routed by the coordinator, fixed here.

**TRUE `--scatter` NUMBER: 28 type-size/weight utilities across 9 files, not 0.**
All 28 are inside `shared/ui`, i.e. in the components themselves rather than at
call sites — whether that is a violation is Jacob's call, but the stated target
for this metric is zero on the reasoning that "a heading size changes in ONE line
of typography.css", and a hardcoded `text-sm` in `base/table.tsx` defeats that.

```
shared/ui/IconTile.tsx:39                     text-small
shared/ui/base/breadcrumb.tsx:18,46,60        text-sm text-base / text-base / text-base font-normal
shared/ui/base/command.tsx:81,155,171         text-sm / text-sm / text-xs
shared/ui/base/dialog.tsx:105,118             text-lg / text-sm
shared/ui/base/form.tsx:132,150               text-sm / text-sm
shared/ui/base/label.tsx:23                   text-micro font-medium
shared/ui/base/popover.tsx:68,77              font-medium / text-sm
shared/ui/base/table.tsx:34,55,80,120,133,149 text-small font-normal / text-micro / font-medium /
                                              text-micro md:text-small font-medium / text-micro
                                              md:text-small / text-small
shared/ui/inputs/InputDropdownSearch.tsx:150  font-medium
```

**AND THE DEFAULT MODE WAS BLIND THE SAME WAY: 0 → 6 over-specified call sites**
across 4 files (it also now sees 409 call sites where it used to see fewer):

```
features/orders/purchaseOrders/admin/.../AdminReceived.tsx:345,646  <TableRow>
    transition-colors hover:bg-transparent opacity-50 hover:bg-muted/30
    bg-success/10 hover:bg-success/20      <- both CANCEL THEIR OWN HOVER
features/orders/salesOrders/admin/.../AdminPreparing.tsx:98,160     <Button>  opacity-30
shared/ui/inputs/FloatingLabel.tsx:30                               <Label>   transition-all
shared/ui/table/PopoverSelect.tsx:119   <PopoverContent>  bg-transparent border border-border
```

The conversions belong to lane C (`frontend/features/**`, `frontend/shared/**`).
This lane owns the instrument and has handed back the real figure.

HOW IT WAS PROVED, per this lane's own rule: a `cn("flex", active && "text-2xl
font-bold", "text-[13px]")` planted in a copy of the real tree moved the count
28 -> 30 and named the file. Then the FIX was attacked: reverting
`classNameExpressions` to the old quoted-only matcher makes the self-test FAIL
with "This is the cn() blind spot reopening". Five spellings are now pinned in
the self-test — `cn()`, a conditional inside `cn()`, `clsx()` nested in `cn()`, a
bare ternary, and an object literal — plus a negative case proving `text-center`
still reads as layout.

**THE BLIND SPOTS ARE NOW WRITTEN IN THE FILE**, above `classNameExpressions()`,
because a blind spot nobody wrote down reports as clean (D95). What it still
cannot see: a class string held in a variable or an imported variant map; a name
assembled from fragments (`text-${size}`); anything outside `.tsx`; and, in the
default mode, attributes after an arrow function, because the element regex stops
the blob at the first `>`. The count is a floor on the scatter, never a proof of
zero — and the output now says so on every run.

D6. Blind spots written down   ██████████████████   100%

## Status

DONE. 23 of 54 scripts carry an executed self-test (was 8, and one of those
eight had been FAILING). Two shared libraries built. The meta-guard is gate
member 9. Every guard listed below was verified by PLANTING A VIOLATION, not by
reading its output.

## What was built

`api/scripts/lib/self-test.mjs` — the attack harness every `--self-test` runs
through. It SPAWNS the whole script against a synthetic tree pointed at by an
environment variable rather than importing a matcher and feeding it a string,
because all three of the walk-shaped rots (route-guards' hardcoded `routes.ts`,
audit-wire-readiness' `api/frontend`, `diff`'s SyntaxError) happen BEFORE any
matcher is reached. It refuses a suite that has no `pass` case as well as no
`fail` case: a detector that rejects everything would otherwise score full marks.

`api/scripts/lib/suite-invocation.mjs` — D123's second rule, mechanised. Reads
`api/package.json scripts.test` and refuses to guess. Nothing spells out
`node --test` any more.

## Hardened, and how each was proved

| script | floor | self-test | violation planted |
|---|---|---|---|

## Baseline (measured, not assumed)

- 45 scripts in `api/scripts`, 4 in `frontend/scripts`, 2 libs under `scripts/lib`.
- 14 of the 45 carry a self-test or a floor; 31 carry neither (D123's count, re-measured and confirmed).
- All 51 files parse under `node --check` today, so D118's failure mode is not currently live.
| `lint-db-calls.mjs` | 200 files / 120 calls, plus a missing `legacy/` is a broken walk | 6 cases | `pool.query` appended to the REAL `features/checkout/repo.exchange.js` (full 338-file corpus, real floors) → exit 1 |
| `lint-migrations.mjs` | 90 files, and an empty dir now fails instead of printing "passed (0 files)" | 7 cases | `DROP TABLE exchange.payouts` added to a copy of the real 103-migration set → exit 1 |
| `lint-imports.mjs` | 900 specifiers (was `=== 0`, blind to partial breakage) | 6 cases | broken relative + `#subpath` + a `.js` specifier served only by a `.ts` file → exit 1 each |
| `lint-namespace-calls.mjs` | 900 calls (was `=== 0`) | 4 cases | `spots.getSpotsByOrderThatMoved()` in a real-corpus `scripts/` file → exit 1. This is the D110 guard and `scripts/` is inside its walk |
| `lint-row-vs-list.mjs` | known-present control (`checkout` must still contribute list-returning exports) | 4 cases | `getSellCartScrapItems(...).pre_melt` in a copy of the real `features/orders/service.ts` → exit 1 |
| `audit-switches.mjs` | switch floor (existing) + a bypass floor: no facade found = refuse | 8 cases | see D4 below |
| `audit-test-leaks.mjs` | — | existing, plus the invocation is now read | `scripts.test` stripped of `NODE_ENV` → throws; changed to `vitest` → throws; removed → throws |
| `audit-slow-tests.mjs` | existing | existing | same three refusals, shared library |

## D4 — audit:switches now sees a bypass (COMPLETE)

D142's case is live and the audit now names it:

```
bypass scan: 2 switched facade(s), 3 direct import(s) of an implementation examined
  known  features/quotes/service.ts -> features/checkout (next)
```

Three direct imports of a switched implementation exist. **Only one is a
bypass.** `features/checkout/service.ts:12` and `features/payments/service.ts:15`
are `import type` — they compile away and reach no schema. Reporting all three
would be three findings where there is one, which is how a guard gets ignored.

`features/quotes/service.ts:27` is `import * as checkoutRepo` and calls
`findProductIdByName`. That is the real one.

It is PINNED IN BOTH DIRECTIONS, the `ACCEPTED` shape from `audit:query-paths`:
an unlisted bypass fails the gate, and a listed one that stops reporting ALSO
fails. **So when lane A fixes `features/quotes/service.ts`, `audit:switches`
will go red** until the `KNOWN_BYPASSES` entry is deleted — the failure message
says exactly that. This is deliberate: an exclusion that outlives its subject
silently excuses the next one.

Attacked on the real corpus: a planted `import * as p from
"#features/payments/repo.next.ts"` in `features/spots/` → exit 1, named. The
same file rewritten as `import type` → not reported, and the count of findings
did not move.

## D5 — the meta-guard (COMPLETE, gate member 9)

`api/scripts/lint-script-guards.mjs`, wired into the root `check` chain right
after `lint:migrations`. **The gate is now 23 members.** It costs 10 seconds and
fails early. It makes four assertions:

1. **EVERY SCRIPT PARSES.** `node --check` over all 54. This is D118 and nothing
   else can catch it: the casualty there was the runner, not a caller, so there
   was no import to lint and no error message to read.
2. **EVERY SCRIPT IS EXECUTABLE-VERIFIED OR EXPLICITLY EXCUSED**, pinned from
   both sides. An unlisted script with no self-test fails; a listed one that
   GAINS a self-test fails too, so the excuse list can only shrink.
3. **A `--self-test` IS RUN, NOT COUNTED.** Having the flag in the source is not
   evidence. It requires exit 0 **and** output that says a self-test ran,
   because a script that ignores an unknown flag exits 0 having done its ordinary
   work — the same optimism that let a census pass on a subset of routes.
4. **THE ENVIRONMENTAL RULE.** A hand-assembled `node --test` fails, and a
   known-present control requires at least two scripts to still be reading the
   invocation from `package.json` — because the first check can only fire on a
   script that spells `--test` out, and is silent about one that quietly stops
   going through the library.

Census today: **54 scripts, 54 parse, 20 self-tests executed, 2 deferred by name,
32 excused by name, 2 reading the suite invocation from package.json.**

### Proved by attack, in place, on the real tree

| attack | result |
|---|---|
| A real `SyntaxError` appended to `diff-source.mjs` (D118's shape) | `PARSE api/scripts/diff-source.mjs`, exit 1. Restored, self-test green |
| A new `audit-newthing.mjs` that counts things and guards nothing | `NO-GUARD`, exit 1 |
| `audit-test-leaks.mjs` reverted to `spawn("node", ["--test"], { env: { TZ } })` — D115 exactly | `ENV` **and** the suite-library control, exit 1. Restored |
| Its own 9-case `--self-test` | every one of the four assertions plus both floors and both pin directions |

**The environmental check was itself found blind mid-attack and fixed.** It
matched the bare path `lib/suite-invocation.mjs`, so any file that merely
*mentioned* the library in a comment counted as compliant — including
`audit-test-leaks.mjs`, whose header explains why it uses it. The D115 attack
therefore PASSED on the first try. It now requires the actual `from "…"`
import. A guard satisfied by a comment about itself is not a guard.

## D3 — the environmental rule (COMPLETE)

`api/scripts/lib/suite-invocation.mjs` reads `api/package.json scripts.test` and
**refuses to guess**. Three refusals, each attacked directly against a mangled
copy of package.json:

- `scripts.test` loses `NODE_ENV` → throws, naming `is-test-run.ts`'s two legs
- `scripts.test` runs `vitest` instead of node → throws
- `scripts.test` removed → throws

`audit-test-leaks.mjs` and `audit-slow-tests.mjs` both go through it. Neither
spells `node --test` out any more, and `audit-test-leaks` now also pins its cwd
to `api/` — `node --test` discovers its files relative to cwd, so a run started
from the repo root would have quietly tested a smaller set.

## D6 — every scanner's blind spot, written in its header

D95's lesson: a detector's blind spot reports as CLEAN. Written into
`lint-db-calls`, `lint-imports`, `lint-namespace-calls`, `lint-row-vs-list`,
`lint-migrations`, `route-guards`, `audit-switches`, `audit-query-paths`,
`lint-call-site-styling` and `audit-state-collapse`. The ones worth a second
glance:

- **`lint-migrations` is line-based.** `DROP\n  TABLE exchange.payouts;` matches
  nothing, and dynamic SQL in a `DO $$ … EXECUTE format(…) $$` names no table it
  can read. This is the guard on "do not lose data", so the gap is stated rather
  than waited for. Every migration in the tree writes these on one line today; a
  formatter that wrapped them would open it silently.
- **`route-guards` attributes guards PER ROUTE.** A blanket
  `router.use(requireUser)` would report every route on that router as
  UNGUARDED. Checked: no file does this, and the failure direction is a false
  alarm rather than a false clean.
- **`audit-switches`' bypass scan cannot see raw SQL.** A feature that imports no
  repo and writes `SELECT … FROM products.bullion` inline reaches the new schema
  with no import to find — and `features/quotes/service.ts` does exactly that
  *alongside* the import it is pinned for. `audit:query-paths` walks those
  statements; the switch audit does not.
- **`lint-db-calls` walks `features/` and `legacy/` only.** Verified at the time
  of writing that the only `query(` outside them is the executor itself, the
  transaction helper's BEGIN/COMMIT/ROLLBACK, and the test pool. A repo that
  moved into `shared/` would leave the scan without a word.

## A FIFTH ROTTED SCRIPT, found by the meta-guard's first run

`audit:frontend-nullability`'s `--self-test` had been **failing** — nothing runs
it, so nobody knew. Its one known-present control was `spotPriceSchema`
requiring `bid_spot`, and the 2026-08-28 contracts conversion DELETED that
schema. The finding was not missed; the subject was retired. That is the right
failure (an assertion that cannot see its subject fails) and it is exactly why a
self-test needs **more than one control** — a single control makes a guard as
durable as the most deletable thing it points at. Repointed to two that survive
(`addressSchema.line_1`, `achSchema.routing_number`), with the failure text now
telling the next reader to repoint rather than delete.

## A SIXTH: a scanner that only worked from one directory

`frontend/scripts/audit-state-collapse.mjs` computed its root as
`process.cwd().endsWith("/frontend") ? cwd : join(cwd, "frontend")` — true of the
two places it happened to be invoked from and false everywhere else. Run from
`frontend/scripts` it resolved `frontend/scripts/frontend/app/styles/theme.css`
and died on ENOENT. Same shape as D120's three assumptions: correct about the
invocation the code happened to have. Anchored to `import.meta.dirname`; runs
from anywhere now, verified from `/tmp`.

## Remaining honest gaps

- **31 scripts have no `--self-test` and are excused by name**, each with a
  reason in `EXCUSED`. The reasons are of three kinds: actions (`migrate`,
  `backup`, `refresh-from-backup`), dumps whose output IS the artifact, and pure
  database questions where there is no parser to attack. Where a script counts
  something it was given a floor instead — `validate-wire` gained a REGISTRATION
  floor and a PARSE floor, and now prints its SKIPS rather than folding them into
  the match count. The list is pinned so it can only shrink.
- **`audit:test-leaks`' self-test is deferred, not run by the gate.** It writes a
  row inside a transaction it rolls back; correct for that script, wrong for a
  gate member to issue. Run `audit:test-leaks:self-test` deliberately.
- **`diff` is still not a gate member.** It needs both implementations and a
  database. Its floor and `--list` make its structure checkable for the price of
  a process start, and the parse sweep covers the way it actually broke.
- **Three scripts exit non-zero on real findings** and are not gate members:
  `audit:enum-domains` (D39), `audit:payments`, and now
  `lint:typography-scatter` at 28. That is by design.

## Full inventory of what was proved

| script | how it was proved it can SEE |
|---|---|
| `lint-db-calls` | `pool.query` appended to the real `checkout/repo.exchange.js`, full 338-file corpus, real floors → exit 1 |
| `lint-migrations` | `DROP TABLE exchange.payouts` in a copy of the real 103-migration set → exit 1 |
| `lint-imports` | broken relative, broken `#subpath`, and a `.js` specifier served only by a `.ts` file → exit 1 each |
| `lint-namespace-calls` | `spots.getSpotsByOrderThatMoved()` planted in a real-corpus `scripts/` file → exit 1, named. D110's own shape |
| `lint-row-vs-list` | `getSellCartScrapItems(...).pre_melt` in a copy of the real `orders/service.ts` → exit 1 |
| `audit-switches` | a value `repo.next` import planted in `features/spots/` → exit 1; the same file as `import type` → not reported, count unmoved |
| `route-guards` | `creates.routes.ts` renamed on the real tree (D120 exactly) → three controls missing, exit 2; `requireAdmin` stripped from the plaintext-bank-details route → caught by guard, exit 2 |
| `validate-wire` | both floors driven from the environment → exit 1 each |
| `diff-source` | both floors → exit 1; `--list` enumerates without a database |
| `audit-query-paths` | its literal floor and its known-present control, separately |
| `audit-frontend-nullability` | control repointed; the old one is what failed |
| `lint-call-site-styling` | a `cn()` violation planted in the real tree moved 28 → 30; reverting the fix makes the self-test fail |
| `audit-state-collapse` | self-test run from `/tmp`, which the old root heuristic could not survive |
| `lint-script-guards` | three in-place attacks on the real tree, plus 9 self-test cases |

## Crossings, disclosed (D119)

Four files outside `api/scripts/**` and `frontend/scripts/**`:

- `api/package.json` — 13 additive `scripts` entries (the new lints and every
  `*:self-test`). No existing entry changed.
- `frontend/package.json` — 2 additive entries (`lint:list-fanout` and its
  self-test; the script existed with no way to run it).
- `package.json` — **one insertion into the `check` chain**:
  `pnpm --filter @dorado/api lint:script-guards`, at position 9. Gate is 23.
- `docs/waves/overnight-lane-d.md` — this file.

Nothing under `api/features/**`, no test file, no `frontend/features/**` or
`frontend/shared/**`, no `api/.env`, no git command, no database write.

## Gate status at handoff

`pnpm check` run from the repo root: **CHECK_EXIT=2**, failing at member 10,
`@dorado/api typecheck`, on `features/places/addresses/tests/replay.test.ts` and
`features/users/tests/replay.test.ts` — another lane's in-flight TypeScript
conversion, no file of mine involved. **Member 9, `lint:script-guards`, passed
inside that run**, and every other member this lane touches passes individually.
