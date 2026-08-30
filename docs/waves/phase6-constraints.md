# Phase 6 — the new schema enforces what exchange did

Owner: this lane. Brief by the coordinator 2026-08-29 under ruling 39; walked
and closed the same day.

```
1. audit:constraints gets an ACCEPTED map  ██████████████████  100%
2. The 27 NOT NULLs, walked once           ██████████████████  100%
3. The unique indexes: real gaps only      ██████████████████  100%
4. audit:constraints joins pnpm check      ██████████████████  100%
```

`audit:constraints` now exits 0 and reports:

```
0 guard(s) with no decision recorded, 21 accepted, 0 stale accept(s), 1 unreadable
every guard exchange holds is either held by the schema that replaces it, or accepted by name
```

It is a member of `pnpm check`, between `audit:query-paths` and
`audit:non-finite`.

## What was upside down (D63)

The audit reported **27 NOT NULLs promotion would drop**, **7 of 16 unique
indexes with no exact counterpart**, **3 CHECKs** and **2 foreign keys**, and it
had no `ACCEPTED` map and no place in the gate. Its siblings `audit:indexes` and
`audit:query-paths` had both, and those two guard *latency*. This one guards
whether an order can exist without a total.

Its own closing line was *"each one should be a decision rather than an
accident"* and there was nowhere to record the decision. There is now: four
`ACCEPTED_*` maps at the top of `api/scripts/audit-constraints.mjs`, each entry
carrying the measurement rather than an assertion.

**Pinned from both sides, and both halves were proved by attack.** An
unaccepted finding fails — demonstrated by the run before the migrations, 18
open, exit 1. A stale entry fails — demonstrated by planting
`probe_entry_that_reports_nothing` in `ACCEPTED_CHECK` and watching it print
`STALE` and exit 1. The floor still fires: `AUDIT_CONSTRAINTS_FLOOR=9999`
exits 1 on 164 pairs compared.

## The order the brief insisted on, and why it was right

Map first, walk second, gate third. Gating with 27 unaccepted findings would
have painted `pnpm check` red for a known thing — the same reasoning that keeps
`audit:enum-domains` and `audit:payments` out. Nothing was added to the gate
until the audit reported zero open.

## A defect in the audit itself: one finding was not true

`exchange.purchase_orders(order_number)` was reported as unmatched against
`refiners.orders` — and **`refiners.orders` has no `number` column at all**. The
unique section never filtered targets by whether they carry the mapped columns,
which is a filter `audit:indexes` has always had (*"a target missing a column is
not evidence of a gap — the index simply does not belong to it"*). It appeared
when 093 added `exchange.purchase_orders -> refiners.orders` to the feature map,
which is why the brief said 7 and the audit said 8.

Fixed: the unique section now builds a candidate list the same way
`audit:indexes` does, and reports `?` when no target holds the columns — never
"present". That is the one line of `1 unreadable` in the summary.

## Accepted, with the measurement (21)

### NOT NULL (15 of the 27)

**Ten sales-order money columns → `orders.transactions`** — `total`, `items`,
`base_total`, `sales_tax`, `shipping`, `surcharge`, `funds`,
`post_charges_amount`, `subject_to_charges_amount`, `used_funds`. Verified by
column list, not inferred: `exchange.purchase_orders` **has none of these
columns**, so the merged row is null for every purchase-order row by
construction. This is D63's own finding, written down where it cannot be lost.

**`sales_order_status` → `orders.orders.status`** — the weaker version of the
same merge: the other parent *has* the column and it is **nullable**, so NOT
NULL would tighten the purchase side rather than restore the sales side.
Measured: 0 nulls in 62 production purchase orders and 48 dev rows, so it
*could* be tightened. Declined because `repo.mirror` copies
`purchase_order_status` straight across and a 23502 there fails the whole order
transaction — a status drives no logic (Jacob's ruling), an unwritten order is
unrecoverable.

**Three on `payments.details`** — `method_id`, `account_holder`,
`provider_ref`. That table merges payout **accounts** with Stripe
**instruments**, and neither half has the other's columns. Measured on dev: 6 of
22 rows have no `account_holder` and all six are intent-derived; 16 of 22 have
no `provider_ref` and all sixteen are payout-derived. `method_id` is resolved
through a `LEFT JOIN payments.methods` in `updateMethod`, which can yield NULL
— on the Stripe webhook path. The Stripe half of the `provider_ref` guard is
restored on `payments.attempts` instead, which is the table that actually holds
one row per intent.

**`sell_cart_items.quantity` → `checkout.items.quantity`** — merged with
`exchange.cart_items.quantity`, which is **nullable**; only the sell side
carried the guard. `req.body.cart` is validated by no contract, so a null
quantity would 23502 on a cart sync that exchange accepts. `checkout.*` is
device-sync, not a ledger. The right fix is a contract on the sync body.
Measured: 3/3 production `cart_items` and 26/26 `sell_cart_items` populated.

### Unique indexes (4 of the 7)

**`carts(user_id)` and `sell_carts(user_id)` → `checkout.checkouts(user_id,
direction)`** — the wider index is the correct translation and the narrower one
would be *wrong*: **17 production users hold both a cart and a sell cart**, and
a unique on `user_id` alone would refuse every one of them.

**`purchase_orders(order_number)` → `orders.orders(direction, number)`** — the
brief asked for the sequences to be confirmed independent before accepting.
They are: `exchange.purchase_orders_order_number_seq` is at **13919** and
`sales_orders_order_number_seq` at **950**, two separate objects. The same
number can legitimately exist once in each direction, so a unique on `number`
alone would be wrong rather than merely narrower.

**`rates(metal_id, unit, min_qty, max_qty)`** — the target's index is
**strictly stronger**, not missing. exchange's plain unique treats a NULL
`max_qty` as distinct and therefore permits two identical open-ended bands;
`rates.rates`' `migration_rates_band_uniq` keys on `COALESCE(max_qty, -1)` and
refuses them. Proved by experiment in a rolled-back transaction: the
exchange-shaped index accepted two identical `(metal, unit, 0, NULL)` rows and
the target-shaped one raised 23505 on the same pair. Dev and production each
hold 4 open-ended bands.

### Foreign keys (2 of the 2)

Neither was in the brief; both are accepted, and for the same reason — **the
table they would point at is an incomplete mirror**, so the FK would refuse a
correct write.

**`payment_intents(session_id)` → `payments.intents(session_id)`** —
`auth.sessions` diverges from `exchange.session` in *both* directions on dev:
**58 exchange rows have no auth counterpart and 2 auth rows have no exchange
one**. An FK would refuse a payment intent created under an unmirrored session,
which is a customer failing to check out.

**`account_transactions(user_id)` → `payments.ledger(user_id)`** — the
`exchange.users → auth.users` trigger mirror (056) is incomplete: **1 of 12 dev
`exchange.users` rows has no `auth.users` row**, because the trigger only fires
on write and predates it. An FK would raise 23503 on a credit adjustment for
that customer. 0 orphans today.

## Fixed (18 findings, three migrations)

### 101 — `the_new_schema_refuses_what_exchange_refused`

The three CHECKs.

- **`orders.items(purity)` and `refiners.items(purity)`** get
  `CHECK (purity >= 0 AND purity <= 1)`, which is `exchange.scrap`'s guard on
  both `purity` and `purity_actual`. This is the top of the brief's list because
  `purity_actual` multiplies into `content_actual`, which is what a customer is
  **paid** on (D47) — a purity of 12 is arithmetic nonsense the old schema
  refused and the new one stored. Written as a bare range test with no
  `IS NULL OR`, exactly as exchange writes it: a CHECK on NULL is UNKNOWN, which
  passes, so an unmeasured purity is admitted by both schemas as before (087).
  Measured first: 0 out of range in `orders.items` (57 rows), `refiners.items`
  (57 rows, 42 NULL), `exchange.scrap`, and in production — including
  `exchange.products.purity`, which **flows** into `orders.items` through 031's
  coalesce and is itself unconstrained (95 rows, 0.9 to 0.9999).
- **`shipping.pickups(status)`** gets the four-word allowlist verbatim,
  American spelling included.

### 102 — `the_not_nulls_that_promotion_would_drop`

The twelve NOT NULLs, each checked three ways: does the merged table's other
parent carry the column and its guard; does every write path supply a value; how
many rows hold NULL, in dev **and** in production where a counterpart exists.

`leads.leads.priority` · `rates.rates.created_by` · `rates.rates.updated_by` ·
`spots.spots.ask` · `products.bullion.quantity` · `orders.orders.number` ·
`shipping.pickups.status` · `payments.intents.type` ·
`payments.attempts.provider_ref` · `payments.settlements.provider_ref` ·
`payments.ledger.occurred_at`.

`orders.orders.number` is the one order-table column in the report with nothing
structural about it: **both** parents are NOT NULL, all three insert paths draw
it from an exchange sequence, and 63 dev rows and 72 production orders hold no
null.

**None of these can newly refuse anything today**, and that is what makes them
safe: every dual write here writes exchange first in the same transaction, so a
value they would refuse is already refused one statement earlier.

### 103 — `uniqueness_survives_the_promotion`

- **`payments.attempts(provider_ref)`** — the Stripe replay guard. exchange is
  unique on `payment_intent_id`; the new schema's only unique touching a
  provider reference was on `payments.details`, the wrong table. A **plain**
  unique, deliberately: Postgres treats NULLs as distinct, so it constrains
  exactly the rows that carry a reference. 21 dev attempts, 0 duplicates.
- **`shipping.services(carrier_id, code)`** — no counterpart of any kind. Free
  today (8 dev rows, 7 with a null code; all 8 production `carrier_services`
  rows have a null code) and a real guard once codes are filled in.
- **`checkout.items(checkout_id, bullion_id)`** — the buy-cart guard, with one
  honest difference written into the migration: the **sell** side never carried
  it, so this constrains a direction exchange left free. Acceptable on three
  measured grounds — all 26 production `sell_cart_items` rows have a NULL
  `product_id` (NULLs are distinct, so none is constrained); the frontend's sell
  cart merges same-named product lines before syncing
  (`shared/store/sellCartStore.ts`, `addItem` and `mergeSellCart`); and
  `checkout.*` is device-sync, so the worst case is a rejected sync the next one
  repairs.

## Defects found, not gaps

**1. `payments.ledger.occurred_at` had no default and nothing supplied it.**
`exchange.account_transactions.occurred_at` is `NOT NULL DEFAULT now()` and
`features/transactions/sql/create.sql` does not name the column — it relies on
that default. The successor column was nullable **with no default**, so the next
credit-ledger entry written through the live path would have landed with no time
on it. Latent only because all 19 dev rows came from 061's backfill and nothing
has written since. This is the customer credit ledger — $66,999.32 across eight
customers in production. Fixed in 102 (default *and* constraint).

**2. `updateMethod` cannot write `payments.details` at all — 23502, proved.**
`features/payments/repo.next.ts` inserts `(id, method_id, bank_name,
account_type, last_four, card_brand, provider, provider_ref)` and
`payments.details.user_id` is NOT NULL with no default. Run against dev inside a
rolled-back transaction it raises
`null value in column "user_id" of relation "details"`. Unreachable today —
`PAYMENTS_SOURCE` defaults to `exchange` — but `repo.dual.updateMethod` runs
exchange first and the new schema second **in one transaction**, so the moment
that switch moves to `dual` the Stripe path fails and takes the exchange write
with it. **Not fixed here**: the exchange statement is an `UPDATE ... WHERE
method_id = pm_...` and needs no user, while the successor is an upsert that
does, and nothing in the live code links `payments.intents.details_id`. Deciding
where the user attribution comes from is a payments design call on the money
path, not a constraint fix.

**3. The pickup status default was a value exchange refuses.**
`legacy/shipping/pickups/repo.ts` defaulted `pickup_status` to `"Scheduled"` and
`features/shipping/pickups/service.ts` to the same, against
`exchange.carrier_pickups`' `CHECK (... 'scheduled' ...)`. A caller booking a
pickup without naming a status got 23514 and lost the transaction. Nothing has
hit it because the one live call site passes `'scheduled'` explicitly, and both
tables hold zero rows on dev and in production — which is also why no test
caught it. Corrected to lowercase alongside 101, which copies the same allowlist
onto `shipping.pickups`.

**4. `verify:backfill` has been red since migration 098, and it is not in the
gate.** `047_seed_reference_data.sql` writes `fulfillments.methods.category` as
`'SHIPMENT'::text`; 098 made that column `fulfillments.category`, an enum, and
did not regenerate the seed. Postgres will not implicitly coerce text to an
enum, so the run dies at 047 with
`column "category" is of type zz_backfill_fulfillments.category but expression
is of type text` — **before it reaches a single backfill**, which means the
whole build-from-nothing path is unverified and production's first migration
run would stop in the same place. Nothing caught it because `verify:backfill` is
not a member of `pnpm check`. Not fixed here: 047 is generated by `dump:seed`
and the omission belongs with 098. The one-line shape of the fix is
`'SHIPMENT'::fulfillments.category`, exactly as the same file already writes
`'sale'::orders.direction`.

**5. `000_genesis_schema.sql` does not create the `checkout` or `auctions`
schemas.** `scripts/dump-schema.mjs`'s `SCHEMAS` list holds sixteen names, not
eighteen, and no migration creates either schema. CLAUDE.md's claim that genesis
"creates every schema, table, view, enum and function" is inaccurate, and
`verify:genesis` cannot see a checkout schema change at all — it builds 16
schemas and says "identical to dev". Production is not exposed today: it already
holds `checkout` and `auctions` from the January refactor, and 103's index
arrives as a migration. Left alone deliberately — widening the list regenerates
genesis with two more schemas and touches `verify:genesis` and
`verify:backfill`, which is a lane of its own.

## Jacob's, not mine

- **The four production rows where the payout fee disagrees with the constants
  table (D117).** Measuring it does not make it mine. Untouched.
- **Whether the `checkout.items` quantity contract should exist.** The accept
  above says the guard belongs on the request body rather than the column;
  writing that contract changes what a cart sync accepts.
- **Defect 2's user attribution.** Which user a Stripe payment method belongs
  to is a payments model decision on the money path.

## Verification

- `lint:migrations` — passed, 109 files, no destructive writes to exchange. All
  three migrations are additive and touch new schemas only.
- `verify:parity` before and after — **byte-identical output**. The five
  pre-existing `NOT SAFE` lines (four empty `checkout.*` pairs, which the
  project's own rule says are not findings, and `metals -> metals.exchange_compat`)
  are unchanged; the migrations moved no rows.
- `verify:genesis` — regenerated (`dump:schema`) and green: *"identical to dev,
  and the committed genesis matches"*.
- **Contracts regenerated.** Eleven fields lost `.nullable()` across seven
  generated files — `leads.priority`, `orders.number`, `products.quantity`,
  `rates.created_by/updated_by`, `spots.ask`, `shipping.pickups.status`,
  `payments.intents.type`, `payments.attempts.provider_ref`,
  `payments.settlements.provider_ref`, `payments.ledger.occurred_at`. Both
  typechecks pass unchanged, so nothing was reading those as nullable. The first
  gate run caught this — `contracts verify:fresh` is member 2 and it is the
  reason a schema change cannot land without regenerating.
- API suite — 967 pass, 0 fail.
- `audit:constraints` — 0 open, 21 accepted, 0 stale, exit 0.
- **`pnpm check` from the repo root — `CHECK_EXIT=0`**, read from the file, with
  `audit:constraints` inside it.
- `verify:backfill` — **run past defect 4 with a temporary local cast on 047,
  then reverted** (047 is byte-identical to HEAD again). With the probe in place
  the whole chain executes end to end, 029 through 100, and **raises no 23502,
  23505 or 23514**: not one of the twelve NOT NULLs, three CHECKs or three
  unique indexes refused a backfilled row. It reports 25 tables `ok` and 56
  content differences, and those cannot be mine — a constraint can only refuse a
  value, never change one, so every differing value predates this lane. The one
  backfill that *would* have raised is `074`, and it was fixed rather than
  discovered late: see below.

### The one backfill this broke, and the edit that fixes it

`074_backfill_payment_intents.sql` inserted `payments.intents` **without
`type`**, leaving 076 to fill it two migrations later. That worked only while
the column was nullable. Genesis carries the finished shape, so on a build from
nothing 074 is the first statement to meet the new NOT NULL and it raises 23502
before 076 gets its turn — production's first migration run, not dev's.

074 now carries `e.type` (`exchange.payment_intents.type` is itself NOT NULL, 0
nulls) in the insert and the `ON CONFLICT` update. 076 still runs and is still
correct; it now updates a value that already matches. Edited rather than left,
on the precedent 031 records in its own comment for 086: *"this file is part of
the build-from-nothing path, and a backfill referencing dropped relations breaks
it."* Its checksum changes, so `migrate` prints the immutability warning it
already prints for five other files.

The other three backfill projections were measured rather than assumed:
`payments.attempts.provider_ref` comes from
`exchange.payment_intents.payment_intent_id` behind a `WHERE ... IS NOT NULL`;
`payments.settlements.provider_ref` comes from
`payments.stripe_charges.charge_id` where `captured`, which is non-null on every
such row; and the `shipping.services` seed has exactly one non-null `code` among
its eight rows, so the new unique on `(carrier_id, code)` is satisfied by the
seed as written.
