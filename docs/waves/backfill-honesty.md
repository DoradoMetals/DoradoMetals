# `verify:backfill` is honest (2026-09-06)

`pnpm --filter @dorado/api verify:backfill` rebuilds every backfilled table
into `zz_backfill_`-prefixed copies from `exchange` and compares them against
dev. It reported **112 differences and exited 1 on every run**, and the number
had been recorded in FOLLOWUPS three times as "the known dev-drift baseline".
A check whose red means nothing is not a check: this pass makes the exit code
mean what it says, on dev today and on production later.

**Before**: on this branch the script did not even reach the comparison — it
aborted at the first backfill (see "the crash that red was hiding" below).
With that crash fixed it reproduced the historical 112 differences exactly, and
exited 1.
**After**: 0 undeclared differences, exit 0, ~40s, in `pnpm check`.

## Why the differences existed

Since the write pivot (D212/D214, 2026-09-02/03) application code writes ONLY
the native schemas. Dev therefore holds rows created natively (e2e orders,
admin edits, sweeps) and native edits to backfilled rows, and none of those can
be derived from `exchange`. The rebuild differs from dev **by construction**.
On production, where nothing native has been written, the same script is the
real proof the backfills are right and a difference there IS a bug.

The old script compared whole rows as text over the whole table, so it could
not tell the two apart, and every category landed in one undifferentiated
count.

## The classification

Every one of the 112 was classified. `n` counts the reported DIFF lines, which
truncate at 3 per table, so the "rows" column is the real population.

| # | bucket | table | rows | what it is |
|---|--------|-------|------|------------|
| 1 | (a) native creation | `refiners.spots` | 69 | orders placed natively mint their own refiner spot rows |
| 2 | (a) | `refiners.items` | 46 | same, refiner item rows |
| 3 | (a) | `payments.intents` / `attempts` | 32 each | checkout creates intents natively |
| 4 | (a) | `payments.details` | 28 | payout accounts sealed natively since D210 |
| 5 | (a) | `shipping.tracking` | 75 | every scan since the pivot |
| 6 | (a) | `fulfillments.fulfillments` / `shipments` | 34 / 28 | native orders make their own |
| 7 | (a) | `places.addresses` | 54 | dev's own per-order snapshots plus natively saved addresses |
| 8 | (a) | `shipping.shipments` | 11 | labels bought natively |
| 9 | (a) | `orders.*` | 17 each | e2e orders, seeded and placed natively |
| 10 | (a) | `leads.leads` | 1 | a lead captured natively on 2026-09-03 |
| 11 | (a') rebuild mints an id | `places.addresses` | 50 | 031 snapshots one address per order with `gen_random_uuid()`; the id differs on every rebuild and can never match by key. The old script hid these behind an undeclared `WHERE EXISTS (exchange.addresses)`. |
| 12 | (a'') dev deleted it | `shipping.tracking` | 10 | `tracking.test.js` deleted five dev shipments' scan history in August; `exchange` keeps the only copy and the rebuild restores it |
| 13 | (a'') | `payments.intents` / `attempts` / `details` | 22 / 22 / 17 | 22 dual-era intents created 2026-09-01/02 whose native rows were deleted (`payments/intents` has a delete path and the sweeps use it); the attempt and detail rows go with them |
| 14 | (a'') | `orders.orders` / `transactions` | 5 each | five dual-era purchase orders (2026-08-27, Pending) were cleaned out of `orders.orders` and left in `exchange` |
| 15 | (b) native-owned column | `spots.spots` | 16 values | the spot ticker refreshes ask/bid/changes on a cron |
| 16 | (b) | `orders.spots` | 208 values | re-locking an order's spots; `created_at`/`updated_at` |
| 17 | (b) | `orders.transactions` | 86 values | `updated_at`/`updated_by` (116's audit trigger), `refiner_fee`, `created_by` |
| 18 | (b) | `orders.orders` | 69 values | `order_sent`, `tracking_updated`, `review_created`, `updated_at`/`updated_by`, `created_by` |
| 19 | (b) | `shipping.shipments` | 37 values | the FedEx tracking sweep, a re-bought label's service and stamp |
| 20 | (b) | `orders.items` | 26 values | `confirmed` and `unit` from the admin drawer |
| 21 | (b) | `fulfillments.fulfillments` | 7 values | status and handover method |
| 22 | (b) | `leads.leads` | 4 values | `created_by_id`/`updated_by_id`: a native insert leaves them null, 029 maps the legacy name |
| 23 | (b*) rebuild declines | `payments.intents` | 2 values | `user_id`: 076 deliberately nulls a user id no `auth.users` row backs, because 117's `intents_user_fk` is NOT VALID and a fresh write of a dangling id raises 23503. Documented in 076 and now declared in code. |
| 24 | **(c) BACKFILL DEFECT** | `orders.orders.spots_locked` | 8 rows | see below — fixed |
| 25 | **(c) BACKFILL DEFECT** | `products.bullion` | whole table | see below — fixed |
| 26 | (d) populated, undeclared | `media.emails` | 1 | 090 created the mail log after the pivot; `exchange` never had one |
| 27 | (d) populated, undeclared | `shipping.pickups` | 17 | see the finding below — declared, NOT fixed |

`created_by` on `orders.orders` and `orders.transactions` deserves its own
note: dev says `E2E Customer` and `exchange` says `Dorado Metals Exchange` on
thirteen dual-era orders. The dual-write mirror stamped the business where the
native insert stamped the customer. The backfill reproduces `exchange`, which
on production is the only record there is, so the rebuild is right and the
difference is dev's.

## The two backfill defects, both fixed

**`products.bullion` — the crash that red was hiding.** The pricing lane's
migration 131 dropped `stock` and `quantity` from `products.bullion`.
`029_genesis_backfill.sql` still named both columns in its INSERT, and genesis
is regenerated from dev, so a build from nothing aborted at 029 with
`42703: column "stock" of relation "bullion" does not exist`. **Production day
would have failed at the first backfill.** Nobody saw it because the script was
expected to exit 1. Fixed in 029 (both columns dropped from the INSERT and the
SELECT) — the same edit-in-place convention D68 used when 086/085 broke the
build.

**`orders.orders.spots_locked` — a column with a source that nothing read.**
086 carried `spots_locked` onto `orders.orders` from `orders.offers`, a table a
from-nothing build never creates, and its own header says "exchange
purchase_orders already has its own spots_locked column and keeps it". No
backfill ever read that column, so on a rebuild every purchase order landed
`false`; eight of dev's are `true`. Fixed in 031, which now carries
`coalesce(p.spots_locked, false)` on the purchase branch. Sales orders have no
such column in `exchange` and keep the default. Additive, and it reproduces
exactly what `exchange` holds.

## The finding that is NOT fixed: `exchange.carrier_pickups` blocks 094

`shipping.pickups` holds 17 dev rows and no backfill writes it. That is not an
oversight — `exchange.carrier_pickups` keys on the ORDER and `shipping.pickups`
keys on the SHIPMENT, and 094 says so in its own guard:

> `exchange.carrier_pickups holds % row(s) and the chain models no home for an
> order-keyed pickup - write that backfill before this migration runs.`

**That guard raises unconditionally while any row exists, and `exchange` now
holds six** (dual-era mirrors of natively created pickups; 094's header still
says "both databases hold zero today"). So a from-nothing migration of dev
aborts at 094, and production will too if it holds any. Nothing sees this
because 094 is not named `backfill` or `seed`, so `verify:backfill` never runs
it and `verify:genesis` runs no migrations at all.

Not fixed here: mapping an order-keyed pickup onto a shipment is a modelling
decision (which shipment, and where `carrier` and a numeric
`confirmation_number` go), and production's count is unknown from this
worktree. `shipping.pickups` is declared in `NOT_REBUILT` with that reason and
a **pinned exchange row count of 6**; if the count moves, the script fails and
forces the entry to be re-read. Ids only, no customer data: the six are the
`exchange.carrier_pickups` rows whose `id` also appears in `shipping.pickups`.

## What changed in the comparison

`api/scripts/verify-backfill.mjs`, rewritten around three ideas.

**1. Compare per column, not per row-text.** Each entry's `cols` is split into
labelled columns (a subselect must now carry an `AS` alias — a column no report
can name is a hard error) and every value is cast to `text` in SQL, so a
difference is reported as `table  key  column` rather than two 200-character
tuples. Values are printed only under `--values`; the default output carries
ids and column names and no customer data.

**2. Scope by the population `exchange` can produce.** Each table may declare
`population`: SQL over `exchange` ALONE (reading a native schema in it is a
hard error) returning the key columns. Then

- a live row whose key is **not** in the population was written natively — out
  of scope, counted, named in the summary;
- a live row whose key **is** in the population and that the rebuild did not
  produce is a **backfill defect** and fails;
- a built row not in dev fails unless the table declares `absentInDev`;
- a built row outside the population fails unless the table declares
  `mintedByRebuild`, whose SQL says how many such rows `exchange` justifies —
  minting more or fewer than that fails;
- a population that resolves **nothing**, or that claims a key neither side
  holds, fails. A scoped comparison that has gone blind must not look clean.

A table with no `population` is compared whole, which is the strictest option,
so the declaration is what buys the leniency and never the absence of one.

**3. Every exclusion carries a reason, in code, or the script fails.**
`native` (columns native code owns), `rebuildDiffers` (columns the rebuild
deliberately does not reproduce), `population`, `mintedByRebuild` and
`absentInDev` all require a reason string of at least ten characters;
`NOT_REBUILT` entries are checked the same way, which is how five `"same"` and
`"seed data"` shorthands got written out. A `native` column that is not among
the compared columns, or that is a key column, is also a hard error.

**The declarations are pruned to drift that is actually observed.** Every
column listed under `native` differs on dev today; a column that native code
could write but currently matches is deliberately left in the comparison,
because while it matches it is still catching a mapping bug for free. The
consequence is intended: a new legitimate drift turns the gate red until
someone writes the one-line reason. That is the check working.

**What was kept**: the unregistered-populated-table guard, the idempotency
re-run (now per row rather than per joined string), and the check that the
backfill refuses once the new schema holds rows `exchange` does not.

That last one interacts with the scoping and it is worth being explicit,
because the two statements look contradictory. The scoping says *dev*
legitimately holds rows `exchange` does not. The refusal check says the
*backfill* still refuses to run into a schema in that state. They are about
different databases and opposite directions: the refusal is tested on the
scratch `zz_backfill_` copy, which is built from `exchange` inside the
transaction, and the population scoping is never applied to it — a stray row in
the scratch schema is exactly the `built row outside the population` case,
which fails. The order also matters and is unchanged: the refusal check runs
last, because it dirties the scratch schema.

## The self-test

`node scripts/verify-backfill.mjs --self-test` — 16 cases, no database. The
comparison is a pure function (`diffTable`), and the self-test plants a
difference of each kind: an undeclared column difference is reported, the same
difference declared is not; a live row outside the population is out of scope
while one inside it is a defect; a stray built row, a blind population, an
over-claiming population and a wrong mint count are each reported; and an
exclusion with an empty reason refuses to load at all. It runs at the top of
**every** normal run as well, so a broken detector fails loudly instead of
reporting a clean backfill. `lint:script-guards` runs it on the gate, and its
`EXCUSED` entry for this file was deleted — the linter caught the stale excuse
itself.

Proved it can fail against the real database before trusting it: deleting the
`orders.items.confirmed` declaration reports three rows differing on
`confirmed` and exits 1; restoring it returns to exit 0.

## Numbers

|  | before | after |
|---|---|---|
| exit code | 1 (every run, for months) | 0 |
| reported differences | 112 | 0 undeclared |
| rows compared | not reported | 1299 across 32 tables |
| out of scope | not distinguished | 495 written natively, 81 exchange holds that dev no longer does, 50 minted with a generated id |
| declared drift | not distinguished | 453 values on native-owned columns, 2 the rebuild declines |
| wall time | 15s to the crash; 43.6s to the 112 once 029 was fixed | 38.2-42.0s standalone over three runs, 45.4s inside `pnpm check` |

Under 90s, so it joined the `dev-db` group in `scripts/check.mjs` (kept serial,
D196) after `verify:genesis`, and the literal `check:serial` chain in the root
`package.json` alongside it. It now gates commits.
