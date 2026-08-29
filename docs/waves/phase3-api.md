# Phase 3, API half — one home for every type

Owner: unassigned (brief written by the coordinator 2026-08-29, not yet dispatched).
One writer per file: whoever takes this lane owns this file and nothing else.

```
A0. Executor: 35 declarations become one   ░░░░░░░░░░░░░░░░░░    0%
A1. API: 118 cross-file types out of features/  ░░░░░░░░░░░░░░░░░░    0%
A2. API: 70 single-file types stop exporting    ░░░░░░░░░░░░░░░░░░    0%
A3. API: 29 input/patch shapes into contracts   ░░░░░░░░░░░░░░░░░░    0%
A4. lint: a type has exactly one home           ░░░░░░░░░░░░░░░░░░    0%
```

## The ruling

Jacob: *"if we have types randomly living in files, then we have failed"* and
*"we shouldn't have types — except for like, reasonable things i.e. a client
only onClick handler — living in feature code."*

## The numbers, all re-derived 2026-08-29

188 exported type/interface declarations in `api/features/`. **118 appear in
more than one file; 70 appear in exactly one.** For the API the test is
mechanical, which is why it can eventually lint: a type used in more than one
file crosses a boundary and belongs in the contracts; a type used in exactly one
file is an implementation detail and should not be exported. No third case.

**A3's count is 29, not the 31 this brief inherited** — 22 `*Input`, 6 `*Patch`,
1 `*Update`, and 12 of the 29 are cross-file. It is a LOWER BOUND: it matches on
name suffix, so a request body called `NewAddress` is invisible to it. Whoever
takes A3 should re-derive from the controllers rather than trusting a suffix.

## Start with A0 — it cannot break

`export type Executor = PoolClient | undefined;` is declared **35 times**, all
byte-identical, and referenced in 69 files (D178). One declaration in
`shared/db/`, 35 imports, 35 deletions, no behaviour change. Do it first: it
proves the mechanics end to end on something that cannot break, and it removes
35 items from A1's judgement list before any judgement is required.

## What NOT to sweep with it

**Twelve other names are declared more than once** — `Direction` (3), then
`Window`, `SpotRow`, `Quote`, `PriceableLine`, `PickupInput`, `OrderSpotRow`,
`OrderPrices`, `Lookups`, `ComposedAddress`, `Category` at 2 each. **These are
not D178.** Two types sharing a name may describe genuinely different things —
`Category` in products is not `Category` in sales-tax — and shared-name
confusion has already produced three false findings on this project
(`audit:frontend-nullability`'s `serviceSchema`/`code`). Diff the two
definitions before assuming they are one type.

## Moving a type and adopting it are ONE commit (D176)

47 of 128 existing contract exports are imported by nothing. Nine of those are
hand-written types somebody wrote and nobody adopted; six are checked by nothing
at all. A contract is validated by USE — an unimported one has never been
compared against the SQL, the caller, or the row, and has exactly the authority
of a comment while looking like a guarantee.

So a type parked in `@dorado/contracts` with its old definition still in use is
**strictly worse than leaving it alone**, because it looks migrated. Every move
lands with its adoption in the same diff.

## What not to lose in the move

Several types are deliberately wider than they look, and a contract that narrows
them asserts something about callers the compiler already disproved — the same
class of loss as the `?? 0` that D145 rejected.

- `ServiceInput` is all-optional-and-untrusted because it **is** `req.body`, and
  the `flag()` helper beside it distinguishes `false` (a value) from `undefined`
  (absent).
- `ShipmentUpdate` types every timestamp as `Date | string` because callers
  spread a row pg already parsed, and `shipping_label` as `string | Buffer`
  because FedEx returns a buffer.

## Gate

`pnpm check` from the REPO ROOT as a fresh compound, backgrounded, and read
`CHECK_EXIT` from the file — never from the task notification. Budget ninety
minutes: the dev database is remote at ~160–200 ms per round trip.

**Do not kill processes.** A subagent's pattern-based cleanup killed the
coordinator's gate runs twice and left a committed order in dev (D177). Report
orphans; the coordinator kills.
