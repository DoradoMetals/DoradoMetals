# Migration spec — the order of work, phase by phase

Short answer: **restructure first, then the database, one schema at a time, in
the order the business runs.** The restructure changes no behaviour and makes
every later phase land in its final place once. Each database phase is
tables + backfill + repos + use cases + tests, together, for one part of the
model. The frontend follows each API surface after it lands, never before.

[migration-plan.md](migration-plan.md) is the summary. This file is the spec.
[README.md](README.md) holds the principles. FOLLOWUPS D213 holds the rulings.

## Standing rules for every phase

- **Branch**: `model-redesign` off `api-hardening`. One branch per phase off
  that when lanes run in parallel, each in a worktree.
- **Covenant**: `exchange` is read, never written. No migration runs against
  production. `pg_dump` is the first step of the eventual production day.
- **Gate**: `pnpm check` green, launched as a fresh compound from the repo
  root. Plus the phase's own acceptance list below.
- **Tooling moves with the tables**: `scripts/lib/feature-map.mjs` is
  re-pointed in the same commit as the table it maps, or `audit:coverage`
  and `audit:precision` go blind. Several audits carry a floor for this
  reason. A floor firing is a finding, not noise.
- **Tests move with their subject** in the same diff (ruling 31).
- **Agent tiers** (AGENTS.md): haiku for moves and renames, sonnet for
  specified implementation, opus for money math, backfills and reviews.
  Fable only with Jacob's approval. The orchestrator writes no code.
- **Frontend**: informs nothing. Adapted per surface in Phase 6.

## Phase 0 — audit, decisions, restructure

**Goal**: a repo laid out as `db/` `domain/` `http/`, with the layer rule
enforced, and no behaviour change.

### 0a. Audit the January schemas

Running now: an Opus agent audits every non-`exchange` table for
normalization, keys, types, naming, nullability and audit columns, and
writes `docs/model/audit-january-schemas.md`. Its findings feed the phases
below; tables it marks "fix in place" get fixed in the phase that touches
their schema.

### 0b. Decisions — DECIDED by Jacob, 2026-09-02

| Decision | Ruling |
| --- | --- |
| Rename `products` → `catalog` | No. *"products is fine, we'll rename later if needed."* |
| Rename `payments` → `transactions` | Yes, in Phase 4, because `orders.transactions` dissolves into it. |
| Create `pricing` (spots, rates, tax) | Yes, in Phase 3, when pricing is touched. |
| Backfill carts (`cart_items` 2, `sell_cart_items` 3 rows) | No. *"yes skip."* Checkout is device-sync. |
| Which stage prices a customer purchase | declared → assayed only. `received` does not price. And, restated: *"the order statuses SHOULD NO LONGER drive any logic. They are visual flair and categorization"* — the payable rule reads lots, never status (D211). |
| Dev's post-2026-09-02 rows | Lost per table as rebuilt. *"I guess it's fine."* Measured 2026-09-02: five test orders and their children — `orders.orders` 5, `orders.spots` 9, `orders.transactions` 5, `refiners.orders` 5, `refiners.spots` 8, `fulfillments.fulfillments` 3, `payments.intents` 4, `payments.details` 3, `shipping.packages` 3, `checkout.items` 1. All from the e2e seed and the purge-day test runs. |
| `exchange.account_transactions` (19 rows, customer credit ledger, no destination today) | Gets one: `transactions.ledger`, Phase 4. |
| `auctions` (1 + 10 rows) | Not designed. Stays in `audit:coverage` as unclaimed until it is. |

### 0c. Restructure

Mechanical. No SQL changes, no signature changes, URLs do not move.

1. Add import roots to `api/package.json`: `#db/*`, `#domain/*`, `#http/*`.
2. `git mv` every `features/<f>/repo.ts` and `features/<f>/sql/` (and the
   sub-resource ones) to `db/<f>/…`. Their tests go to `db/<f>/tests/`.
3. `git mv` everything else in `features/<f>/` (service, compose, create,
   read, patch, reconcile, utils, their tests) to `domain/<f>/…`.
4. `git mv` `routes.ts` and `controller.ts` to `http/<f>/`.
5. Rewrite import specifiers (`#features/x/repo.ts` → `#db/x/repo.ts`, and
   so on). Delete the `#features/*` root when nothing references it.
6. Add `scripts/lint-layers.mjs` and wire `lint:layers` into `pnpm check`:
   `db/` imports only `#db`, `#db/sql`, contracts; `domain/` imports `#db/*`,
   `#domain/*`, `#shared/*`, `#providers/*`; `http/` imports `#domain/*`,
   `#http/*`, contracts, express. Floor: fails if it walks fewer than 100
   files. Expect violations on day one — current services import repos
   across features freely. Record them as an `ACCEPTED` list that shrinks
   per phase; the lint fails on a NEW violation, not on the list.
7. Re-point everything that hardcodes `features/`: `feature-map.mjs`,
   `lint:db`, `lint:row-vs-list`, `audit:silent-mutations` (resolves
   namespaces through import paths), `audit:query-paths`, the
   `migrate-feature-schema` and `verify-changes` skills, CLAUDE.md "How a
   feature is laid out". Each audit's floor and control must still pass.
8. Delete `api/example/` and the `.git/info/exclude` line; it served its
   purpose.

**Lanes**: haiku does the moves and specifier rewrite from a script; sonnet
does the lint and the tooling remap; opus reviews the diff for a moved test
that silently stopped running (compare test counts before and after: 896).

**Acceptance**: 896/896 still green; `lint:layers` runs with its ACCEPTED
list and its floor; every audit reports the same numbers it reported before
the move; `git diff --stat` shows renames, not deletes plus adds.

### 0d. Constraint sweep (one additive migration, no model change)

Fixes from the audit that are independent of the model and non-destructive.
One migration, applied before Phase 1 so every later phase starts from a
sound schema.

- Re-point `media.emails.user_id` and `payments.details.user_id` FKs from
  `exchange.users` to `auth.users` (audit: cross-cutting, [keys]).
- Add missing FKs: `orders.addresses.order_id`, `payments.intents.user_id`,
  `payments.ledger.user_id`, `organizations.organizations.image_id`. Skip
  `orders.transactions.order_id`: the table dissolves in Phase 4 (audit:
  `orders`, `payments`, `organizations` sections, [keys]).
- `VALIDATE CONSTRAINT` on the five `NOT VALID` FKs (`reviews.reviews.order_id`,
  `reviews.reviews.user_id`, `products.bullion.metal_id`,
  `products.bullion.mint_id`, `rates.rates.metal_id`); list any bad rows it
  names as a finding (audit: `reviews` section, [keys]).
- Add `created_at` to `payments.attempts` and `payments.settlements`; make
  `settlements.settled_at` NOT NULL only if the one row allows (audit:
  `payments` section, [audit-cols]).
- `shipping.packages.length` / `.width` / `.height` text → numeric (all 12
  rows cast cleanly) (audit: `shipping` section, [types]).
- `ON DELETE` on the nine `checkout.checkouts` FKs: CASCADE or SET NULL,
  because checkout is disposable and today a stale cart blocks deleting a
  saved address or payout detail (audit: cross-cutting, [keys]).
- Index every FK column the audit lists without one (audit: cross-cutting,
  [keys]).
- `UNIQUE (name)` on `metals.metals`; `CHECK (rating BETWEEN 1 AND 5)` on
  `reviews.reviews` (audit: `metals, spots, rates` section and `reviews`
  section).
- One `set_updated_at()` trigger function applied to every table that has
  `updated_at` (audit: no table maintains it by trigger) (audit:
  cross-cutting, [audit-cols]).
- Drop dead columns `shipping.services.provider_code` and
  `max_declared_value` ONLY after `grep` proves no reader; otherwise list as
  deferred (audit: `shipping` section, [types]).
- Drop every `created_by text` / `updated_by text` column that sits beside a
  `_id` column of the same meaning; the id is the reference, the text is a
  leftover freeze nobody asked for (0e, `reviews.reviews.name` decision).

Tier: sonnet writes the migration, opus reviews; `verify:genesis` and
`pnpm check` must be green; `lint:migrations` must pass (additive only).

### 0e. Decisions from the audit — DECIDED by Jacob, 2026-09-02

| Decision | Ruling |
| --- | --- |
| `orders.orders.status` | `text` with a `CHECK` constraint generated from the same list the zod contract holds. No lookup table, no enum type. Jacob: no join or extra SQL for a label list with no attributes. Categorization lives in code (`rules.ts`). |
| `shipping.carriers`, `refiners.refiners`, `products.mints` 1:1 children | Keep all three as 1:1 children of `organizations`. Name and logo live on `organizations` only; each child holds only its type-specific columns. Carriers = FedEx/UPS/USPS, refiners = who we sell to, mints = product flair such as the U.S. Mint. |
| `payments.details` | NOT split. Keep `methods` (the option list a customer picks from at checkout, by direction) and `details` (a customer's saved instance of a method). `details` is reshaped to: `method_id`, `provider`, `provider_ref` (Stripe payment-method id / Plaid account id), `last4`, `label`, and one sealed `envelope` column for any secret (bank numbers today, Plaid tokens later). No card columns anywhere: Stripe holds card data. The 23 plaintext columns go. Plaid is added after the migration as one more provider. |
| `payments.intents` | Keyed by `checkout_id` (nullable), not session. One open intent per checkout; the amount is updated when the cart changes; on placement the intent gets `order_id` and `checkout_id` clears. `session_id` stays as a bare uuid for the audit trail. Orphans: a sweep cancels at Stripe any intent with a `checkout_id`, no `order_id`, status `requires_payment_method`, idle longer than a threshold, and marks the row `cancelled`; emptying or resetting a checkout cancels its intent after the commit. Intent rows are never deleted. |
| `tax.sales_tax_rules` | `numrange` + GiST exclusion, Phase 3. |
| `reviews.reviews.name` | Drop and join. Also every `created_by text` / `updated_by text` beside a `_id` column: drop, in the 0d constraint sweep. |
| `*_exchange_compat` views | Remove as each reader is rewritten. |
| `rates` into `pricing` | Yes, Phase 3. |

`products` → `catalog` is already decided: keep `products`. Not listed again.

## Phase 1 — lots

**Goal**: one row per physical lot, measurements by stage, three item tables
gone.

**Tables**: `items.items`, `items.measurements`, `checkout.lines`,
`orders.lines` (see [lots.md](lots.md)). `orders.lines` carries `premium`,
`sales_tax_charged`, `confirmed`; no `content`, no `price` (Phase 3 removes
the last readers).

**Backfill from `exchange`** (dev counts in brackets; production is larger):

| Source | Target | Rule |
| --- | --- | --- |
| `scrap` (20) | `items.items` + `measurements(declared)` + `measurements(assayed)` where `*_actual` is not null | one lot per scrap row; declared from `pre_melt/post_melt/purity`; assayed from the `_actual` trio |
| `purchase_order_items` (42) | `items.items` (bullion) + `measurements(declared)` from the product's weight and purity + `orders.lines` | premium from the source row |
| `sales_order_items` (29) | same, on the sales order | |
| `cart_items`, `sell_cart_items` | none | per 0b |

`items.measurements.purity` is unconstrained numeric; the `.9999` rows
that D200 measured must survive. `audit:precision` gets a `FLOWS` entry
for the bullion weight that lands in a declared measurement.

**Code**: `db/items`, `db/items/measurements`, `db/checkout/lines`,
`db/orders/lines` with the five verbs. `domain/checkout/add-item.ts` mints
the lot. `domain/orders/read.ts` assembles lines + lots + latest measurement
per stage. `domain/orders/edit-line.ts` replaces the four item wrappers.
`domain/refining/record-assay.ts` writes an assayed row instead of updating
`refiners.items`. Every reader of `checkout.items`, `orders.items`,
`refiners.items` is re-pointed; then those three tables are dropped from
genesis (they are January tables, never authoritative anywhere).

**Acceptance**: `verify:backfill` round-trips scrap and both item tables
and proves idempotency; `audit:coverage` shows no populated `exchange`
column of the four sources unmapped; `audit:test-leaks` clean; the contracts
regenerate (`Item`, `Measurement`, `OrderLine`, `CheckoutLine`);
`validate:wire` refuses nothing undeclared.

**Tier**: sonnet implements; opus writes and reviews the backfill.

**Audit findings folded in** (`docs/model/audit-january-schemas.md`):
- `products.bullion.content` equals `gross` on 56 of 62 rows and is wrong on
  the 1oz Gold American Buffalo (stores 1 with purity 0.9999). Must be
  corrected BEFORE declared measurements are minted from it (audit:
  `products` section).
- `stock` / `quantity` overlap on `products.bullion` (audit: `products`
  section).
- Unify `unit` spelling across `rates.rates` and the item tables (audit:
  cross-cutting, [naming]).
- Unify casing of enum-like text values (audit: cross-cutting, [naming]).
- Remove the `refiners.exchange_compat` view join from the product read when
  `db/products` is written (audit: cross-cutting, [normalization]; decision
  9).

## Phase 2 — orders with a counterparty, spots freeze, refining and the pool

**Goal**: refiner orders are orders; the lot is the only join; the pool is a
ledger.

**Tables**: `orders.orders` gains `refiner_id` and the exactly-one check;
`orders.spots` is confirmed as the per-order freeze (it already is);
`refiners.pool_entries` is new (see [refining.md](refining.md)).
`refiners.orders`, `refiners.items`, `refiners.spots` dissolve.

**Backfill**:

| Source | Target | Rule |
| --- | --- | --- |
| `purchase_orders` (38), `sales_orders` (28) | `orders.orders` with `user_id` | re-derived; the January backfill already does most of this |
| `order_metals` (240) | `orders.spots` | the customer freeze; already mapped |
| `refiner_metals` (192) + `suppliers` (2) | one refiner `orders.orders` row per (purchase order, refiner) + `orders.spots` + `orders.lines` for the order's lots + `pool_entries(credit)` for settled ounces | rows with all-zero values are the "every metal listed" artefact; skip them, count what was skipped |
| `refiner_metals.pool_oz_deducted` | `pool_entries(lock)` at the row's spot | the date is the order's updated_at; state that it is approximate |

**Code**: `db/refiners/pool-entries`; `domain/refining/create-refiner-order.ts`
(pick lots), `record-settlement.ts` (assayed rows + pool credit),
`lock-from-pool.ts`; `domain/orders/rules.ts` gains `isPayable(lots)`.
The admin refiner surface's reads move to the order-scoped family filtered
by counterparty.

**Acceptance**: every `refiner_metals` row is either mapped or counted as
skipped-zero; `audit:coverage` clean for `suppliers` and `refiner_metals`;
the pool balance per (refiner, metal) equals the sum the old columns
implied, asserted by a test that prints both.

**Tier**: opus for the backfill and the ledger rules; sonnet for repos and
http.

**Audit findings folded in** (`docs/model/audit-january-schemas.md`):
- `orders.orders` four nullable boolean flags encode progress (three NULL on
  47 of 62 rows; `review_created` true on 5 orders with no review row) →
  replaced by facts per D211 (audit: `orders` section).
- `orders.orders.status` constraint decision (see 0e) (audit: `orders`
  section).
- `refiners.refiners` shrinks per refining.md (audit: `refiners` section).
- `spots.spots` derived deltas with no history, accepted as a
  provider-supplied freeze — a history table is out of scope (audit:
  `metals, spots, rates` section).

## Phase 3 — pricing: derive content and price

**Goal**: no stored derivation anywhere; `pricing` schema holds the live
inputs.

**Tables**: `pricing.spots` (from `spots.spots`), `pricing.rates` (from
`rates.rates`), `pricing.sales_tax` and `pricing.sales_tax_rules` (from
`tax.*`). Drop `content` and `price` from every table that still has them.
`orders.lines.sales_tax_charged` stays frozen.

**Backfill**: `state_sales_tax` (51), `sales_tax_rules` (88), `rates` (16)
re-pointed to the new schema; `audit:enum-domains`'s `product_type` finding
is fixed here because the rule table moves.

**Code**: `domain/orders/rules.ts` — `fineContent`, `linePrice`,
`orderTotals`, `stageFor(order)`; `domain/quotes` re-pointed to price from
rows through those functions; `features/quotes/service.ts`'s
`SELECT id FROM products.bullion` read moves to `db/products`. Tests for the
rules run without Postgres. A golden test prices the 38 dev purchase orders
through the new function and compares to the stored totals before the
column is dropped; differences are listed, explained, and accepted by
Jacob, then the column goes.

**Acceptance**: golden test signed off; `audit:precision --prod` still 0;
`pnpm check` green; no `content` or `price` column left in any schema.

**Tier**: opus for rules and the golden test; sonnet elsewhere.

**Audit findings folded in** (`docs/model/audit-january-schemas.md`):
- `tax.sales_tax.amount_owed` is an accumulator with no journal → per-accrual
  rows so the balance can be recomputed and attributed (audit: `tax`
  section).
- `tax.sales_tax_rules` seven min/max pairs and `state_code` without FK
  (decision 6) (audit: `tax` section).
- `rates` into `pricing` (decision 10) (audit: `metals, spots, rates`
  section).

## Phase 4 — transactions

**Goal**: `payments` → `transactions`; `orders.transactions` dissolves; the
customer credit ledger gets a home.

**Tables**: `ALTER SCHEMA payments RENAME TO transactions`. New
`transactions.ledger` for `exchange.account_transactions` (19 rows, 8
customers, real money, no destination today). `orders.transactions`'
columns move: shipping charge and service → `shipping.shipments`;
`payout_details_id`, `payout_fee`, `used_funds` → `transactions.payouts`
keyed by order. `transactions.details` is NOT split (0e, decision 3): kept
alongside `transactions.methods`, reshaped to `method_id`, `provider`,
`provider_ref` (Stripe payment-method id / Plaid account id), `last4`,
`label`, and one sealed `envelope` column for any secret; the 23 plaintext
columns go and no card columns exist anywhere (Stripe holds card data);
Plaid is added after the migration as one more provider.

**Intents keyed by checkout** (0e, decision 4): `transactions.intents` is
keyed by `checkout_id` (nullable), not session. One open intent per
checkout; the amount is updated when the cart changes; on placement the
intent gets `order_id` and `checkout_id` clears. `session_id` stays a bare
uuid for the audit trail. **Orphan sweep**: cancels at Stripe any intent
with a `checkout_id`, no `order_id`, status `requires_payment_method`, idle
longer than a threshold, and marks the row `cancelled`; emptying or
resetting a checkout cancels its intent after the commit. Intent rows are
never deleted.

**Backfill**: `payment_intents` (43) re-pointed and keyed by `checkout_id`
where one resolves, else left null; `payouts` (33) → the per-order payout
row, bank numbers still read from `exchange.payouts` until
`encrypt:payouts` runs on production; `account_transactions` → `ledger`.
`dorado_funds` stays the one live `exchange` write.

**Code**: `db/transactions/*`; `domain/payment/charge.ts`, `webhook.ts`,
`release.ts`; `domain/payout/pay-customer.ts` (checks `isPayable`, prices
on assayed at the customer's spot); `domain/users/adjust-credit.ts` writes
the ledger and the balance in one transaction.

**Acceptance**: `audit:coverage` no longer lists `account_transactions`;
`audit:payments` unchanged (it reports production, which is not touched);
the sweeps read `transactions.intents`; `audit:plaintext-secrets` still 0 on
dev.

**Tier**: opus review of anything touching bank details; sonnet implements.

**Audit findings folded in** (`docs/model/audit-january-schemas.md`):
- `payments.details` holds bank, card and eCheck in one row with plaintext
  beside encrypted (decision 4) (audit: `payments` section).
- `payments.intents.session_id` FK or uuid (decision 5) (audit: `payments`
  section).
- `payments.methods` two `text[]` marketing columns, one empty everywhere →
  drop or move (audit: `payments` section).
- `shipping.shipments.cost` / `actual_cost` duplication resolves when
  `orders.transactions` dissolves (audit: `shipping` section).
- Add `updated_at` to `shipping.shipments` (audit: `shipping` section,
  [audit-cols]).

## Phase 5 — the orchestration, use case by use case

**Goal**: the old service files are gone; `domain/` is one file per use
case; no prop spreading in the API.

Order, which is the order the business runs:

1. `checkout`: add-item, remove-item, set-fulfillment (two ids),
   set-payment (one id), set-address (id or new shape).
2. `orders/place-purchase.ts`, `orders/place-sale.ts` — the zero-body
   creates. Label and Stripe intent outside the transaction.
3. `fulfillment/attach.ts`, `schedule.ts`, `cancel-schedule.ts`.
4. `orders/receive.ts` — new: the intake weighing writes `received`
   measurements. Nothing does this today.
5. `refining/*` from Phase 2, finished.
6. `orders/finalize-pricing.ts`, `payout/pay-customer.ts`, `orders/cancel.ts`.
7. Admin edits: `orders/edit-line.ts`, `orders/edit-order.ts` (the guarded
   patch), `orders/add-funds.ts`.
8. Delete `domain/orders/service.ts`, `compose.ts`, `create.ts`,
   `*.service.ts`. Test count must not drop unless a test's subject died.

Each use case: test written first from "what does the client send, what
rows exist afterward"; one public function; `rules.ts` for anything pure;
`lint:layers` ACCEPTED list shrinks to zero by the end of this phase.

**Tier**: sonnet per use case; opus for place-* and pay-customer; a
`grep -c '\.\.\.' domain/` that is not zero is a review finding.

**Audit findings folded in** (`docs/model/audit-january-schemas.md`):
- `leads.leads` three booleans encode one state machine → one status column
  or facts (audit: `leads` section).
- `leads.contact` is a name in text (audit: `leads` section).
- `reviews.reviews.name` (decision 8) (audit: `reviews` section).
- Images modelled three ways → one pattern (audit: cross-cutting,
  [normalization]).
- The `*_exchange_compat` views renamed or removed as their readers are
  rewritten (decision 9) (audit: cross-cutting, [normalization]).
- `auth.employees.role` duplicated on `auth.users` — note only, auth is left
  alone (audit: `auth` section).
- `places.locations.type` enum-like text and no audit columns (audit:
  `places` section).
- The audit-column set applied at one level everywhere (audit:
  cross-cutting, [audit-cols]).

## Phase 6 — the frontend follows

Per surface, after its API surface landed: regenerate contracts, adapt the
hooks and forms, run the surface's e2e spec, fix what it finds. Checkout
first (it was due an overhaul anyway), then the admin order drawer, then
refining, then payouts. No API change is made to accommodate a component.

**Tier**: sonnet; haiku for mechanical renames.

## Phase 7 — UAT, then production

Unchanged from `uat-environment-plan`: a database restored from a
production `pg_dump`, `compare:databases` to prove the restore, the whole
chain of migrations and backfills run there, `verify:parity` and
`audit:coverage` against it, the Stripe SDK majors, then CI/CD. Only then
`pg_dump` production, migrate, backfill, verify, merge. Jacob runs that
day.

## What each phase produces

| Phase | Produces | Risk it retires |
| --- | --- | --- |
| 0 | layered repo, layer lint, audit report, constraint sweep | files landing twice |
| 1 | lots + measurements, three tables gone | copies of a lot drifting |
| 2 | counterparty orders, pool ledger | refiner data that could not express pooling or exposure |
| 3 | derived money, `pricing` schema | stored numbers going stale |
| 4 | `transactions` schema, credit ledger home | $66,999.32 with nowhere to go |
| 5 | one file per use case | the 35-function service |
| 6 | frontend on the new shapes | — |
| 7 | production on the new model | the 42P01 deploy hazard |

## Not in scope

Auctions. The cancelled-orders purge (six-table cascade, future). Encrypting
the 24 plaintext payout rows on production (Jacob's, needs the
`allow-destructive` marker). Stripe 18 → 22 (UAT).
