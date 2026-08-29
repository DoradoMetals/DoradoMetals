# Waves

Where the rewrite is. Bars first, plan below, findings at the end.

```
OVERALL   ████████████████████████████████░░░░   ~88%
```

| | phase | | |
|---|---|---|---|
| ✅ | **shipped** ten commits, `0a201bc0` → `af8bc790` | `██████████████████` | landed |
| 🔄 | **phase 1** the write pivot, and the instruments | `░░░░░░░░░░░░░░░░░░` | IN FLIGHT, two lanes |
| ⬜ | **phase 2** checkout, then payments — the last two | `░░░░░░░░░░░░░░░░░░` | queued |
| ⬜ | **phase 3** one home for every type — 347 declarations | `░░░░░░░░░░░░░░░░░░` | queued, its own wave |
| ⬜ | **phase 4** production, and three decisions | `░░░░░░░░░░░░░░░░░░` | Jacob's |

## Phase 1 — IN FLIGHT

Detail: `docs/waves/write-pivot.md` · `docs/waves/instruments.md`

Task names below are the lanes' own, copied from their files rather than
invented for this page — when the index and a lane file disagree, the lane file
wins.

```
1. The covenant ledger, run BEFORE the switch  ██████████████████  100%
2. The five missing native statements       ███████████████░░░   85%
3. Switch the writes to native, feature by feature  ░░░░░░░░░░░░░░░░░░    0%
4. Delete api/legacy/ and the dual machinery  ░░░░░░░░░░░░░░░░░░    0%
```

```
1. Type coverage for scripts/ (D157)        ████████████░░░░░░   65%
2. The 28 remaining .test.js files          ░░░░░░░░░░░░░░░░░░    0%
3. ComposedOrder probe (D159, report only)  ░░░░░░░░░░░░░░░░░░    0%
4. The meta-guard's missing half (D5)       ░░░░░░░░░░░░░░░░░░    0%
```

**The one-way door is open.** Jacob, 2026-08-29: *"Yes exchange can stop
receiving those writes."* That is ruling 36, and it is what thirteen
`api/legacy/` directories and fourteen dual-writing features were waiting on —
one decision rather than fourteen, because the per-feature switches that would
have gated them individually were deleted as each feature's reads pivoted.

**The order is fixed.** `verify:parity` compares source to target, so once
`exchange` stops being written there is nothing left to compare. The ledger runs
FIRST and is the deliverable; then the five native statements missing from
`repo.dual` — which mirrors by re-deriving *from* exchange, so deleting that
half would strand the new rows; then the switch, feature by feature; then
deletion.

## Phase 2 — the last two features

```
1. Checkout: overhaul, then pivot its reads ░░░░░░░░░░░░░░░░░░    0%
2. Payments: pivot, slowly                  ░░░░░░░░░░░░░░░░░░    0%
```

**Only two features still read `exchange`.** The other twenty-four are fully
pivoted — no `repo.exchange`, no switch. When these two land there are no
`*_SOURCE` switches left, `repo.exchange` is gone from the codebase, and the
migration is complete in code.

They are not the same job. **Checkout** is the overhaul Jacob has flagged; its
data is device-sync — empty is fine, losing it is fine, it only has to work — so
it is the low-risk one and it goes first. **Payments is the most dangerous
feature in the repository**: fourteen sets of unencrypted bank details, the
$126.48 webhook thread, and a parity test that was comparing nothing until it
was rewritten last night. It goes last and slowly.

## Phase 3 — one home for every type

```
1. API: 118 cross-file types out of features/ ░░░░░░░░░░░░░░░░░░  0%
2. API: 70 single-file types stop exporting   ░░░░░░░░░░░░░░░░░░  0%
3. API: 31 input/patch shapes into contracts  ░░░░░░░░░░░░░░░░░░  0%
4. Frontend: 22 zod schemas into contracts    ░░░░░░░░░░░░░░░░░░  0%
5. Frontend: 137 remaining declarations       ░░░░░░░░░░░░░░░░░░  0%
6. lint: a type has exactly one home          ░░░░░░░░░░░░░░░░░░  0%
```

Jacob: *"if we have types randomly living in files, then we have failed"* and
*"we shouldn't have types — except for like, reasonable things i.e. a client
only onClick handler — living in feature code."*

**347 declarations, and the two halves are the same job.** The API has 188
exported types in `features/`, 118 of them used in more than one file. The
frontend has 159 in `features/`, reached by 162 imports into 23 different
`types.ts` files — one checkout file alone pulls seven schemas from seven
features *alongside* its `@dorado/contracts` import.

**Two rules, and they answer different questions.** For the API the test is
mechanical: a type used in more than one file crosses a boundary and belongs in
the contracts; a type used in exactly one file is an implementation detail and
should not be exported. No third case, so it lints.

For the frontend the test is a judgement, per declaration: **is this DATA or is
this UI?** A handler signature, a component's props, a reducer's local union —
those are genuinely local and stay. Anything describing data is a contract
wherever it currently sits. That is why this is a wave and not a sweep: the
wrong call is silent in both directions, since a UI type in the contracts is
only clutter but a data type left in a feature is exactly the drift six waves
have been removing.

**The 22 zod schemas are the sharp end.** They validate data crossing the wire
and three are `.parse()`d on the checkout path, so a frontend schema can reject
the API's own response — which is what `audit:frontend-nullability` measures:
77 fields compared, 31 stricter than their column, 17 in schemas parsed at
runtime. A schema both sides import cannot disagree with itself.

**What not to lose in the move.** Several of these types are deliberately wider
than they look. `ServiceInput` is all-optional-and-untrusted because it *is*
`req.body`, and the `flag()` helper beside it distinguishes `false` (a value)
from `undefined` (absent). `ShipmentUpdate` types every timestamp as
`Date | string` because callers spread a row pg already parsed, and
`shipping_label` as `string | Buffer` because FedEx returns a buffer. A contract
that narrows these is not tidying — it asserts something about callers the
compiler already disproved, the same class of loss as the `?? 0` that D145
rejected.

## Phase 4 — Jacob's

```
1. pg_dump production                       ░░░░░░░░░░░░░░░░░░    0%
2. Migrate production (most of genesis)     ░░░░░░░░░░░░░░░░░░    0%
3. Backfill                                 ░░░░░░░░░░░░░░░░░░    0%
4. verify:parity + compare:databases        ░░░░░░░░░░░░░░░░░░    0%
5. Merge                                    ░░░░░░░░░░░░░░░░░░    0%
```

**Production is not being touched and is not a blocker** — no migration has run
there and none will until this refactor is proven. Recorded for that eventual
day: production holds ten of the eighteen schemas and **lacks eight outright**
(`products`, `organizations`, `metals`, `spots`, `media`, `leads`, `rates`,
`reviews`), so the sequence is not "migrate and backfill", it is "most of
`000_genesis_schema.sql` has never run there".

**Phase 1 makes this order absolute rather than advisory.** With dual-writes in
place, deploying early served stale reads. Without them, deploying early means
new writes land in schemas that do not exist — 42P01 on the write path, and no
`exchange` row written either. The safety net that made a premature deploy
merely embarrassing is the thing phase 1 removes.

## Blocked on Jacob

- **The payout fee is not a function of the payout method.** Production: WIRE 20
  on six rows and **0 on two**; ECHECK 0 on thirty-nine, **75 on one and 125 on
  one**. Four rows disagree with the constants table. Either those are
  deliberate waivers — in which case a fee is per-order data, not reference data
  — or they are wrong. (D117. This said "eleven" until the tracker recomputed
  it; the eleven was the count of rows that *agree*.)
- **One production order line's two copies disagree on weight and purity** —
  `d16b7c32`, `pre_melt` 18.662 vs 20.000, `purity` 0.570 vs 0.563. On a
  purchase order those are the two numbers a customer is paid on.
- **The Terms and Conditions need a lawyer, for two reasons now.** The offers
  purge deleted both deemed-acceptance clauses, the entire "Rejecting Our Offer"
  section and the seven-business-day term — the Return Policy survived but its
  *trigger* did not, so the document describes no mechanism by which a customer
  declines a price and recovers their metal. And clause 177 promises insurance
  "up to $50,000" where migration 097 sets `max_insured_value` to 10,000 (D152 —
  we created that one, on the instruction to seed 10,000).

## Standing, and never scheduled

**Bank details are plaintext at rest, and fourteen of them are in production.**
Of 61 payouts, 10 ACH and 8 WIRE rows carry real routing and account numbers in
the clear. This has been on the list since the beginning, and every wave has had
a better reason to do something else. At some point that stops being triage.

## What was found

The full record is `FOLLOWUPS.md`, which is the authority. If you read three:

- **D148 — the guard on "do not lose data" was blind, and something had already
  walked through it.** `lint:migrations` could not see a `DROP` split across
  lines; a planted one produced *"no destructive writes to exchange"*. Closing
  it found migration 086 dropping five columns from `exchange.purchase_orders`
  with no marker, because the `ALTER` wraps.
- **D162 — a test whose closing assertion passed because its subject never
  happened.** Ten of thirteen calls spread a draft where three wrapped it, so
  "setting a default clears the others" cleared nothing: the address had never
  been the default. TypeScript named it in one line.
- **D160 — three wrong numbers in one night, all wrong the same way.** Carried
  forward instead of re-derived. One was mine, one the tracker's, one a lane's.
  Every conclusion survived, which is why nobody caught them sooner.

**The thread through almost all of it:** the code was rarely the problem. Seven
audit scripts were found broken or blind, and the root cause was one word in
`tsconfig.json` excluding `scripts` from type checking. Every instrument was
answering a narrower question than the one being asked of it.

## How this file is maintained

Run `node scripts/waves.mjs` (`--check` to preview) — it regenerates the bars
from every task line in `docs/waves/*.md`, so the numbers are whatever the lanes
last wrote about themselves. It refuses on a duplicate heading, because the
roll-up takes the first block after each one and a second silently attributes
another phase's bars.

One writer per file: the coordinator owns this index, each agent owns exactly
one file under `docs/waves/`, and `FOLLOWUPS.md` is the coordinator's alone and
the authority for D-numbers. Two agents editing one shared file is how two
rulings were lost on 2026-08-28.
