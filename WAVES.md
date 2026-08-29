# Waves

Where the rewrite is. Bars first, plan below, findings at the end.

```
OVERALL   ████████████████████░░░░░░░░░░░░░░░░   ~56%
```

| | phase | | |
|---|---|---|---|
| ✅ | **shipped** ten commits, `0a201bc0` → `af8bc790` | `██████████████████` | landed |
| 🔄 | **phase 1** the write pivot, and the instruments | `██████████████░░░░` ~79% | IN FLIGHT, three lanes |
| ⬜ | **phase 2** checkout, then payments — the last two | `░░░░░░░░░░░░░░░░░░` ~0% | queued |
| 🔄 | **phase 3** one home for every type — 347 declarations | `████████████░░░░░░` ~68% | frontend half landed |
| ⬜ | **phase 4** production, and three decisions | `░░░░░░░░░░░░░░░░░░` ~0% | Jacob's |

## Phase 1 — IN FLIGHT

Detail: `docs/waves/write-pivot.md` · `docs/waves/instruments.md` ·
`docs/waves/seams.md`

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
1. Type coverage for scripts/ (D157)        ██████████████░░░░   75%
2. The 28 remaining .test.js files          ██████████████████  100%
3. ComposedOrder probe (D159, report only)  ██████████████████  100%
4. The meta-guard's missing half (D5)       ██████████████████  100%
```

```
1. SEAM 2 - exchange.users, the inverted direction  ██████████████████  100%
2. The remaining native gaps                ██████████████████  100%
3. SEAM 1 - exchange.payouts, a reachable destination  ███████████████░░░   85%
4. SEAM 3 - purgeCancelled, write-up only   ██████████████████  100%
```

**The seams are the writes that had nowhere to land.** Three tables whose
successor could not receive them: `exchange.users` (the credit BALANCE, not the
ledger), `exchange.payouts`, and `purge_cancelled`. Two are closed and the third
is deliberately untouched. The lane also found a native gap nobody had listed —
`editPayoutCharge` wrote `exchange.payouts.cost` while its successor
`orders.transactions.payout_fee` had existed since 072, and **the two agree today
only because no admin has edited a charge since the backfill**.

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

Detail: `docs/waves/phase3-api.md` · `docs/waves/phase3-frontend.md`. Both blocks
below are the lanes' own task lists, copied from their files.

```
A0. Executor: 37 declarations become one    ██████████████████  100%
A1. API: 8 boundary-crossing types (was '118')  █████████████░░░░░   70%
A2. API: single-file types stop exporting   ██████████████░░░░   80%
A3. API: 29 input/patch shapes into contracts  ░░░░░░░░░░░░░░░░░░    0%
A4. lint: a type has exactly one home       ░░░░░░░░░░░░░░░░░░    0%
```

```
1. Census: DATA or UI, asked per declaration  ██████████████████  100%
2. The zod schemas                          ██████████████████  100%
3. Data types that duplicate a contract     ██████████████████  100%
4. Request bodies into the contracts        ██████░░░░░░░░░░░░   33%
5. Single-file types stop exporting         ██████████████████  100%
```

Jacob: *"if we have types randomly living in files, then we have failed"* and
*"we shouldn't have types — except for like, reasonable things i.e. a client
only onClick handler — living in feature code."*

**The API half turned out to be ~92% not-a-problem, and the metric was mine
(D182).** "118 types used in more than one file" was a `grep -rl` word-frequency
count. Re-derived BY IMPORT it is 105 names, of which **88 never leave their own
feature** (`repo` → `service` → `compose` is a feature's internal layering, not a
type living somewhere random), 9 cross only into `legacy/<the same feature>`, and
**the genuinely boundary-crossing set is EIGHT**. The number did not merely
overstate the size — it pointed at the wrong work, and acting on it would have
driven ninety-seven unnecessary moves, each a chance to narrow a type that is
deliberately wide.

**The rule that replaced it, measured rather than asserted:** *contracts parse
the wire; feature types are what the server knows.* `wire/shipping.ts`'s
`Carrier` types `organization.name` as `string | null` while the column is NOT
NULL — the contract was widened to admit an implementation the wire-axis
retirement already deleted. Adopting it internally hands the compiler a null the
server has disproved. Same for every wire shape whose timestamps are
`z.string()` while pg hands the server a `Date`. So "one home for every type"
cannot mean "one type"; the naive reading was mine, not Jacob's.

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

## Phases 5–9 — PROPOSED, awaiting Jacob's approval

Written 2026-08-29 under ruling 39. Each is grounded in something already
measured, not invented; the D-number beside it is the evidence. **The ordering
is itself the proposal** — argued below, and the part most worth overruling.

These bars are **deliberately excluded from OVERALL** — the heading is
`## Phases 5–9`, which the roll-up does not match, so proposed work cannot drag
down a number that measures committed work. Approving a phase means giving it
its own `## Phase N` heading and a row in the table at the top; until then the
five bars below are a picture of a plan, not progress.

```
5. The verification loop gets fast          ░░░░░░░░░░░░░░░░░░    0%
6. The new schema enforces what exchange did ░░░░░░░░░░░░░░░░░░    0%
7. Money at rest                            ░░░░░░░░░░░░░░░░░░    0%
8. The silence problem                      ░░░░░░░░░░░░░░░░░░    0%
9. Checkout, properly                       ░░░░░░░░░░░░░░░░░░    0%
10. Component library and theming        ░░░░░░░░░░░░░░░░░░    0%
```

**Phases 5–9 APPROVED by Jacob 2026-08-29** (*"Those phases all sound good"*);
10 is his own addition. They keep the `## Phases` heading — and so stay out of
OVERALL — until each is given its own `## Phase N` section and a table row as it
starts.

### Phase 5 — the verification loop gets fast (D180)

**CORRECTED 2026-08-29: the gate is 10–13 minutes, not 90.** I never measured
one and repeated a lane's estimate into this proposal — see D180. What is real
is **128 minutes of summed test time across 947 tests, 153 of them over ten
seconds**, on databases behind Railway's public proxy at 160–200 ms per
statement. The wall clock varies with contention, not latency, because the suite
parallelises across ~26 processes.

So this phase is about **iteration cost, not gate cost**: the slowest single test
is 180 seconds, and anyone working on orders or checkout pays that per attempt.
A local **PostgreSQL 16** for the test suite alone would fix that —
`verify:genesis`, `verify:parity` and `compare:databases` must keep reading real
dev. **It should no longer outrank phases 6 and 7**, which was an ordering I
argued for on the strength of a number that was wrong.

*Needs Jacob for one step*: installing PG16 is a change to his machine, not the
codebase (ruling 39 covers the latter).

### Phase 6 — the new schema enforces what exchange did (D63, D45, D39)

`audit:constraints`: **27 NOT NULL constraints that promotion would drop**, and
they are not incidental — `sales_orders.order_total`, `sales_tax`,
`shipping_cost`, `payouts.method`, `payouts.account_holder_name`,
`account_transactions.occurred_at`. Plus **7 of 16 unique indexes with no exact
counterpart**, including `purchase_orders(order_number)`, where the audit's own
line is *"WIDER is not the same as equal"*.

The audit has **no `ACCEPTED` map and is not in `pnpm check`** — upside down,
since `audit:indexes` and `audit:query-paths` have both, and those guard latency
while this one guards whether an order can exist without a total. Also folds in
D45's missing FK and D39's enum-domain coupling.

*Split point*: whether a given column should be NOT NULL is mostly a quality
call and mine; the four rows where the payout fee disagrees with the constants
table (D117) is a business call and stays Jacob's.

### Phase 7 — money at rest

Bank details are plaintext, and worse than the standing note said: **production
holds them in two tables** — `exchange.payouts` (10 ACH + 8 WIRE) and
`payments.details` (10 rows), 8 customers. Migration 071 was written to remove
the second copy and has never run. `scripts/encrypt-payout-details.mjs` is
described by 073 and `verify-backfill.mjs` as the mechanism that writes those
columns and **does not exist**.

Buildable and testable on dev without touching production (dev holds none), so
the code half is mine; running it against production is Jacob's, in his
sequence.

### Phase 8 — the silence problem

**This project's characteristic failure is not breakage, it is silence**, and it
recurs across unrelated systems: an `UPDATE` matching zero rows raises nothing
(D168, the payout link that resolved for 0 of 16); a mutation whose failure
reaches no handler (D179, mode B — invisible to the customer *and* to Sentry);
a webhook that leaves production with no record of **$126.48 it was paid**; a
scan that reads the wrong filename and reports clean (D176, and twice more by me
in one day). Each was found by accident.

The phase is to make the class detectable rather than to fix five instances:
`rowCount` assertions where zero is wrong, error paths that reach Sentry, and
the standing rule this file keeps re-learning — **a check that reads zero bytes
must refuse, not report**.

### Phase 9 — checkout, properly

Phase 2 makes checkout *work* against the new API; Jacob has said it needs a
real overhaul. This is that: **create-then-charge instead of charge-then-create**
(D179 makes the current ordering survivable and explicitly does not fix it),
which needs a pending-order state, a reconciliation path, and a decision about
what happens to unpaid orders — all Jacob's calls. Plus the cart as honest
device-sync (`checkout.*` is not a ledger; losing it is fine, it only has to
work).

**Last because it is the only one that needs product decisions**, and because
doing it before phase 5 means paying 90 minutes per iteration on the most
iterative work in the project.

### Phase 10 — the design system (Jacob's, 2026-08-29)

*"I want to do components and themeing right... creating and updating old
components which will be the basis of our new design system"*, against a Figma
component library, plus a new sell/checkout form design.

```
10. Component library and theming        ░░░░░░░░░░░░░░░░░░    0%
```

**BLOCKED ON ACCESS, not on effort.** There is no Figma MCP server configured in
this session and Figma design URLs are authenticated — `WebFetch` returns 403 on
both files, refreshed link included. Nothing about the phase is hard; I simply
cannot see the designs. Two ways to unblock, either is fine:

1. **Export the frames as PNG** into `docs/design/` in the repo. Images can be
   read directly, and this needs no setup. Fastest path, and enough to build
   from.
2. **Configure a Figma MCP server** (`claude mcp add …`) — the Dev Mode MCP that
   ships with the Figma desktop app, or the hosted one with a personal access
   token. Durable, and lets tokens be re-read as the library evolves rather than
   re-exported. Needs a session restart to pick up.

**What does NOT need the designs, and is therefore where this starts:** the
codebase already has a styling program with rulings behind it — dark-only,
components own their appearance, shared primitives carry both axes, one input,
`shared/ui` excluded from the call-site styling lint. The first task is an
inventory: every component in `frontend/shared/ui`, what appearance props it
takes, and where call sites still override it. `lint-call-site-styling.mjs
--scatter` already measures the last of those. That inventory is what makes the
Figma library actionable instead of a second parallel vocabulary — and it is the
half most likely to be wrong in a way a picture cannot show.

**One caution worth stating up front**, because it is the failure mode of every
design-system project: a component library is only real if the old components are
*deleted* as the new ones land. Two libraries is worse than one bad library, and
this project already has the discipline for that — see `api/legacy/`'s entry
criteria, which are the same idea applied to repos rather than pixels.

### Two I considered and did not propose

- **Deleting `api/legacy/`.** It is 12 directories of dead weight, but the
  covenant makes the *tables* permanent and the write pivot (phase 1) already
  removes the code. A phase for it would be ceremony.
- **A performance phase.** `audit:indexes` and `audit:query-paths` are both
  green and gated, dev holds tens of rows, and the honest answer is that nothing
  is known to be slow except the test suite, which is phase 5. Inventing one
  would be measuring for its own sake.

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
last wrote about themselves. It refuses on a duplicate heading, because a second
one of the same name silently attributes another section's bars to a row.

**OVERALL is pooled across every task line, and it is a rough measure.** Tasks
are not equal units of work, so read it as "how much of what we wrote down is
done" and nothing finer. It read ~88% until 2026-08-29 — hand-typed, derived
from nothing, and never once recomputed. The drop to ~49% is the arithmetic
arriving, not the project going backwards.

One writer per file: the coordinator owns this index, each agent owns exactly
one file under `docs/waves/`, and `FOLLOWUPS.md` is the coordinator's alone and
the authority for D-numbers. Two agents editing one shared file is how two
rulings were lost on 2026-08-28.
