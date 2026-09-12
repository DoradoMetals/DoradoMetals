# The lot model

Jacob, 2026-09-12, rulings 120 and 121: *"3rd normal form man"* — values in one
place, links in another.

The build had three item tables' worth of figures spread across four: the lot
carried weights, `orders.lots` carried the money, `refining.lots` carried the
refiner's weights and premium, and `refining.pool` carried the ounces. A number
existed in two places often enough that the only honest question was which copy
was the truth. This wave puts every value on the lot and leaves nothing but
links behind.

---

## 1. The schema

```
inventory.lots          every lot: ours, the refiner's copy of ours, the one we
                        mint to sell. Weights, purity, content (generated),
                        the frozen declaration, premium, sales_tax_rate,
                        confirmed_at, settled_at, settled_spot, source.

inventory.lot_sources   (lot_id, source_lot_id, kind) — kind in
                        split | combine | batch | sale.
                        lot_id is ALWAYS the minted lot.
                        source_lot_id is ALWAYS what it came from.

inventory.pool          the refiner's ounce ledger: credit and lock, a lock
                        carrying purpose and, when it sources a sale, lot_id.

orders.lots             (order_id, lot_id). Nothing else.
refining.lots           (refining_order_id, lot_id). Nothing else, and the
                        lot_id names the REFINER lot.
refining.orders         gains settlement_type: paid | pooled.
```

`lots.items` is renamed `inventory.lots` and `refining.pool` is renamed
`inventory.pool`; the `inventory` domain owns both and `db/inventory/` reads the
schema it is named for. The `lots` schema is gone.

### Four edges, one shape

| kind | `lot_id` | `source_lot_id` | written by |
|---|---|---|---|
| `split` | the child | the parent | `POST /api/orders/lots/:id/split` |
| `combine` | the result | each parent | `POST /api/lots/combine` |
| `batch` | the refiner lot | each of our lots | `POST /api/refining/orders/batch`, `POST /api/refining/orders/:id/lots` |
| `sale` | the minted sale lot | the stock lot | `POST /api/orders/:id/lots` on a sale |

`split_from_id` and `combined_into_id` fold into the table: a split recorded one
direction, a combine had no column at all, and neither could hold the two edges
the model needed next. A refiner combining N of our lots is one refiner lot with
N batch edges. A customer-side combine is one customer lot with N combine edges,
and the refiner lot's batch edges are re-pointed at it.

### No kind column

A lot reached through `refining.lots` IS a refiner lot. A lot with a `sale` edge
naming it IS a sale lot. Those are the whole test, and they are the two filters
that stop inventory counting the same metal twice:

```sql
NOT EXISTS (SELECT 1 FROM refining.lots rl WHERE rl.lot_id = li.id)
AND NOT EXISTS (SELECT 1 FROM inventory.lot_sources s
                 WHERE s.lot_id = li.id AND s.kind = 'sale')
```

`api/src/db/inventory/lots/sql/own_lot.sql`, substituted into `list.sql` and
`inventory_by_metal.sql` as `/*__own_lot__*/`. Pool credit reads the other
direction — only refiner lots.

### Price is never stored

`orders.lots.price` is gone and does not come back. Price is
`content x spot x premium`, where spot is the order's frozen `orders.spots` row
for that metal — **bid for a purchase, ask for a sale** — falling back to the
live feed when the order has not locked. `db/pricing/sql/order_pricing.sql`
already computed exactly that whenever the column was null; the column was a
short-circuit, not a second definition. Only the pricing domain computes it.

Measured on the production-shaped copy before the column went, the derivation
reproduces the stored price for **62 of 82 purchase lines** and **10 of 14 sale
lines** — 72 of 96. The 24 that differ are legacy rows whose price was typed
over by hand or priced against a spot the order never froze. The stored number
is in `exchange` and in the dump taken before the migration; nothing new prices
an old order.

### Spots are per pricing event

A settlement can be partial, so the spot is not a property of the refiner order.
Each refiner lot carries `settled_spot` — the metal's spot at the moment Record
settlement ran, stamped server-side from the spots read and editable afterwards
by PATCH — beside its own `settled_at`. A `paid` refiner order's value is the sum
over its lots of `content x settled_spot x premium`, derived and never stored
(`refining.order_money`). A `pooled` order carries no spot anywhere, on the order
or on any lot: what it yields is ounces, credited to `inventory.pool`, and each
pool lock's `lock_price` prices them later.

`settlement_type` defaults to **`pooled`**, which is what the build does today:
settling a sell order writes pool credits and the old `refining.order_money`
valued them at the refiner's last lock price. Dev holds 18 sell orders and 19 buy
orders, none settled, and one pool lock; the production-shaped copy holds 9 buy
orders and no pool entries at all. Nothing anywhere was paid at settlement, so
nothing is mislabelled by the default.

### Where the four `orders.lots` columns went

| column | now |
|---|---|
| `premium` | `inventory.lots.premium` — one lot prices for exactly one order |
| `price` | derived, never stored |
| `sales_tax_charged` | `inventory.lots.sales_tax_rate`. It never held money: `SoldLotPrice.sales_tax` is `sale_quote.sql`'s `sales_tax_rate`, and the dollars live once on `orders.transactions.sales_tax`. The column is renamed to what it is, which also removes a `RENAMES` entry from `feature-map.ts`. The backfill is `NULLIF(sales_tax_charged, 0)`, because the old column was `NOT NULL DEFAULT 0` on every row including purchase lots and a zero there meant "no rate recorded" rather than "taxed at zero per cent"; whether nexus was reached is `tax.sales_tax`'s answer, not the lot's |
| `confirmed` | `inventory.lots.confirmed_at` — an employee agreeing the figures is a fact about the metal, and a fact is a timestamp (ruling 112) |

`refining.lots`'s `unit`, `pre_melt`, `post_melt`, `purity`, `content`, `premium`
and `settled_at` all move onto the refiner lot that `lot_id` now names.

---

## 2. Positions

Derived through `lot_sources`, one expression in
`api/src/db/inventory/lots/sql/position.sql`, substituted into every read.

| position | derivation |
|---|---|
| `consumed` | a `split` or `combine` edge names it as a source |
| `sold` | a `sale` edge names it as a source, or it sits on a sale order |
| `pooled` | its batch child sits on a settled refiner order (or, for a refiner lot, its own order settled) |
| `at refiner` | its batch child sits on a sent, unsettled, uncancelled refiner order |
| `on hand` | on no order, or on a purchase order whose inbound handover has arrived |
| `incoming` | on a purchase order whose handover has not reached its done state |

A refiner lot answers off its own refining order rather than off an edge it does
not have, so a lot and its refiner copy never disagree about where the metal is.

---

## 3. The migrations, and what the rehearsal measured

Rehearsed first on `chain6_round2` — `CREATE DATABASE chain6_round2 TEMPLATE
chain6` on 127.0.0.1:5544, brought from the production chain baseline up to 186
and then through this wave. `chain6` itself was never written. Counts and ids
only; no customer row was read.

| migration | what it does |
|---|---|
| `027a_the_two_item_tables_are_staging.sql` | creates `orders.items` and `checkout.items` for a build from nothing, because 193 drops them and genesis is dumped from dev. Carries `runs-even-under-a-baseline`. |
| `159a_the_columns_the_rebuild_still_writes.sql` | re-adds the eleven columns 188/190/191 drop, for the same reason: 160 creates its tables `IF NOT EXISTS` and in a rebuild genesis got there first. |
| `187_the_inventory_schema_owns_the_lot.sql` | `lots.items` → `inventory.lots`, `refining.pool` → `inventory.pool`, the two stamp functions and the `pool_entry` enum move with them, indexes and constraints renamed, schema `lots` dropped `RESTRICT`. |
| `188_one_lineage_table.sql` | `inventory.lot_sources`, backfilled from `split_from_id` and `combined_into_id`, then both columns dropped. |
| `189_the_lot_carries_what_it_prices.sql` | `premium`, `sales_tax_rate`, `confirmed_at`, `settled_at`, `settled_spot`, `source` onto the lot, backfilled off `orders.lots`. |
| `190_a_refiner_lot_is_a_lot.sql` | mints a refiner lot per `refining.lots` row with its `batch` edge, re-points the link, drops the figure columns, adds `settlement_type`, redefines `refining.order_money`. |
| `191_orders_lots_is_a_link.sql` | drops `premium`, `price`, `sales_tax_charged`, `confirmed`. |
| `192_a_lock_says_what_it_is_for.sql` | `purpose` and `lot_id` on a pool entry; `refining_order_id` relaxed. |
| `193_the_two_item_tables_go.sql` | drops `orders.items` and `checkout.items`. |

### The counts

| | `chain6_round2` | dev |
|---|---|---|
| lots carried into `inventory` | 103 | 138 |
| pool entries carried | 0 | 2 |
| split edges backfilled | 0 | 0 |
| combine edges backfilled | 0 | 0 |
| lots pointing at a row that does not exist | 0 | 0 |
| premiums carried off `orders.lots` | 103 | 132 |
| sales tax rates carried | 1 | 2 |
| confirmations carried | 82 | 40 |
| sale lots minted for a lot on two orders | 0 | 0 |
| refiner lots minted | 13 | 42 |
| refiner lots carrying a figure ours did not | 0 | 6 |
| pool locks given a purpose | 0 | 1 |
| `orders.items` rows dropped | 103 | 103 |
| `checkout.items` rows dropped | 0 | 3 |
| `inventory.lots` at the end | 116 | 180 |

**No lot sits on two orders** on either database, so no premium was ambiguous
and the sale-lot mint 189 carries for that case never fired. The path is
written and reported anyway, because the count is the evidence and not the
assumption.

**A batch edge conserves the weights exactly.** Content differs from the parent
only where the parent's content is a frozen paid snapshot — all 13 on the
production-shaped copy are settled scrap lots, and the worst gap between the
minted lot's generated content and the parent's snapshot is **0.010 t oz**. The
refiner lot's content is generated from its own weights on purpose: a snapshot
would freeze it against the refiner's report.

### Ten migrations were edited

`160` to `179` name `lots.items` and `refining.pool`, and a build from nothing
replays them. They were rewritten to the new names — the same move the facts lane
made on `030` and `031` when `status` was dropped — and reconciled on dev with
`migrate --reconcile`. The files are `160`, `161`, `162`, `163`, `164`, `165`,
`169`, `173`, `178`, `179`.

### Dev drift this lane inherited

Regenerating genesis from dev picked up three tables no migration in this
repository creates: `rates.rate_history`, `spots.overrides` and `spots.settings`.
They arrived on the shared dev database from another lane. `verify:genesis`
compares the committed file against a dump of dev, so they had to come with it;
they are named `RateChange`, `SpotOverride` and `SpotSettings` in the contract
generator and that lane may want different names.

---

## 4. The seven cases, as the rows they write

### 4.1 One lot to one line, and paid

A customer declares one scrap lot and sends it.

```
inventory.lots        L1  declared_* frozen by declare_stamp, premium null
orders.lots           (PO, L1)
```

Intake assays: `PATCH /api/orders/lots/:id` moves `pre_melt`/`post_melt`/
`purity` on L1, `assay_stamp` sets `assayed_at`, the employee agrees and
`confirmed_at` is stamped. `retierPremiums` writes `L1.premium`. Finalize
freezes `orders.spots` and writes `orders.transactions.total`; no price is
stored. `L1.position` is `on hand`.

Batch: one refiner lot.

```
inventory.lots        R1  a copy of L1's figures, premium copied
inventory.lot_sources (R1, L1, 'batch')
refining.lots         (RO, R1)
```

`L1.position` becomes `at refiner`. Settlement writes R1's figures and, on a
`paid` order, `R1.settled_spot`; `L1` becomes `pooled` on a `pooled` order once
the refiner order settles. The payout is priced on **our** figures — L1's — and
always was.

### 4.2 The refiner combines two of ours

We send L1 and L2 separately; the refiner melts them together and reports one
line.

```
inventory.lots        R1
inventory.lot_sources (R1, L1, 'batch')
                      (R1, L2, 'batch')
refining.lots         (RO, R1)
```

One refiner lot, two batch edges. The Settlement row shows R1's figures with its
two sources beside them, each carrying its `share` — its declared content over
the sum of the two. `Adopt refiner assay` on the customer order proposes L1 and
L2's new figures pro rata by that share; the employee confirms and the body
carries what was confirmed. The default offered is to combine L1 and L2 on the
customer side too, which is 4.3 after the fact.

### 4.3 We combine before sending

Two scrap lots on the same order, same metal, same unit, both `on hand`.

```
inventory.lots        L3  purity = sum(content) / fine_content(sum(weight), unit, 1)
inventory.lot_sources (L3, L1, 'combine')
                      (L3, L2, 'combine')
```

L1 and L2 read `consumed`; content is conserved to the digit. Batching then
mints one refiner lot from L3 with one batch edge. After the fact, the same call
re-points: the combine mints L3, and R1's two batch edges are replaced by one
naming L3.

### 4.4 The refiner reports a line we never sent

The refiner's statement has a line with no lot of ours behind it — a sweep, a
recovery, a correction.

```
inventory.lots        R2  the refiner's figures, no declaration of ours
refining.lots         (RO, R2)
```

A refiner lot with **no batch edge**. It is a refiner lot because it is on
`refining.lots`, so inventory never counts it and pool credit does. It has no
customer lot, so it pays no customer: it credits the pool or the refiner's
invoice and stops there.

### 4.5 A correction after settlement

The refiner revises a line.

`PATCH /api/orders/lots/:id` on the refiner lot — the same URL, because the
handler lives with the table and a refiner lot is a lot (ruling 13) — moves
R1's figures and, if the price moved with them, `settled_spot`. `assay_stamp`
re-stamps `assayed_at`. Nothing is deleted and no new row is written: the
declaration R1 froze at mint time is still our figures, so
`R1.content - R1.declared_content` is the variance against what we sent, before
and after the correction. The customer's payout does not move until
`adopt_assay` is run again and confirmed.

### 4.6 A dispute

`refining.orders.disputed_at` is stamped and the derived state reads `Disputed`.
Nothing about the lots changes: the refiner's figures stay on the refiner lot,
ours stay on ours, and the two differ — which is what the dispute is. The
settlement can be re-recorded when it resolves, which is 4.5.

### 4.7 A sale filled from the pool

A sale line sourced from the pool. No lot of ours is consumed, because the metal
is ounces at a refiner.

```
inventory.lots        S1  source = 'pool', premium and sales_tax_rate frozen
orders.lots           (SO, S1)
inventory.pool        a lock: entry = 'lock', troy_oz negative,
                      purpose = 'Source a sale', lot_id = S1, lock_price
```

The balances read is `balance` (credits) minus `locked` (locks) equals
`available`, and the lock is refused when it takes more than is available — a
**confirm**, because a negative pool is a real state a business can choose.
A sale filled from inventory instead mints S1 with a `sale` edge from the stock
lot, which becomes `sold`; a sale filled from a refiner is the existing drop
ship, and the refiner purchase order's linked sales orders derive
refiner lot → `sale` edge → sale lot → `orders.lots` → `orders.orders`. No
order-to-order link is stored (ruling 42).

---

## 5. Response-shape changes, for the frontend pass

The gate runs no frontend member (ruling 55) and the frontend informs no API
decision (ruling 44). These are the wire changes a frontend pass has to absorb.

| shape | change |
|---|---|
| `Lot` | LOSES `split_from_id`, `combined_into_id`. GAINS `premium`, `sales_tax_rate`, `confirmed_at`, `settled_at`, `settled_spot`, `source` |
| `LotPatch` | gains `premium`, `sales_tax_rate`, `confirmed_at`, `settled_at`, `settled_spot`, `source` |
| `LotSource` (new) | the `inventory.lot_sources` row |
| `LotEdge` (new) | `{ id, reference, kind, content, share }` |
| `LotSourceKind` (new) | `split` · `combine` · `batch` · `sale` |
| `LotSourceChoice` (new) | `inventory` · `refiner` · `pool` — a sale line's sourcing |
| `LockPurpose` (new) | `Sell to refiner` · `Source a sale` |
| `SettlementType` (new) | `paid` · `pooled` |
| `LotLineage` | was `{ split_from_id, split_from_reference, children, combined_into_id, combined_into_reference, combined_from }`; is now `{ sources: LotEdge[], derived: LotEdge[] }` |
| `LotWorthSettled` | was `{ post_melt, purity, content, settled_at }`; is now `{ lot_id, pre_melt, post_melt, purity, content, premium, settled_spot, settled_at, share }` |
| `LotTimelineStep.step` | gains `Confirmed` and `Batched` |
| `OrderLot` | LOSES `premium`, `price`, `sales_tax_charged`, `confirmed` — it is (id, order_id, lot_id) plus audit columns |
| `OrderLotPatch` | every field now comes from `Lot`: the PATCH writes the lot, and it accepts a refiner lot's id too |
| `OrderLotView` | `settled` is now a boolean derived in SQL; `price` and `line_total` are derived, not stored |
| `SoldLotPrice` | loses `price`; is `{ lot_id, premium, sales_tax }` |
| `OrderLotView.price` (new) | the derived unit price; `line_total` is it times the quantity for a bullion lot |
| `AdoptAssayCandidate` (new) | `{ id, lot_id, current: LotPatch, refiner: LotPatch \| null, share, proposed: LotPatch }` |
| `AdoptAssayProposal` (new) | `{ lots: AdoptAssayCandidate[] }` |
| `AdoptAssayLot` (new) | `{ id, figures: OrderLotPatch }` — the patch is a NAMED field, not spread into the entry |
| `AdoptAssayBody` (new) | `{ lots: AdoptAssayLot[], combine? }`, `combine` defaults to true |
| `OrderPricingLine.source` | GONE. It said `stored` or `quoted`, and nothing is stored any more |
| `PATCH /api/orders/lots/:id` | may now answer a bare `Lot` — the refiner lot — instead of an `OrderLotView`. Discriminate on `'lot' in response` |
| `POST /api/refining/orders/:id/lots` | the `RefiningLot` rows it answers carry the MINTED refiner lot's id in `lot_id`, not the customer lot id that was sent in |
| `RefiningBatchResult` (new) | `{ order: RefiningOrderRead, taken, skipped: { lot_id, position }[] }` |
| `RefiningLot` | LOSES `unit`, `pre_melt`, `post_melt`, `purity`, `content`, `premium`, `settled_at` — it is (id, refining_order_id, lot_id) plus audit columns |
| `RefiningLotPatch` | now picked from `Lot`: `pre_melt`, `post_melt`, `purity`, `unit`, `premium`, `settled_spot` |
| `RefiningLotView` | gains `sources: LotEdge[]`; `customer_premium` comes from the source lot |
| `RefiningOrder` | gains `settlement_type` |
| `RefiningOrderCreate` / `RefiningOrderPatch` | gain `settlement_type` |
| `RefiningOrderView` | gains `linked_orders: RefiningLinkedOrder[]`; `expected_settlement` is NULL for a `pooled` sell order |
| `RefiningLinkedOrder` (new) | `{ id, number, direction, reference }` |
| `RefiningSpot` | was `{ metal_id, ask, bid, locked }`; is now `{ metal_id, spot, lots, settled_lots }` |
| `RefiningBatch` (new) | `{ refiner_id, lot_ids?, order_ids? }` |
| `PoolEntry` | gains `purpose` and `lot_id`; `refining_order_id` is nullable |
| `PoolBalance` | gains `balance`, `locked`, `available` |
| `PoolLockCreate` | gains `purpose` (required) and `lot_id`; `refining_order_id` is optional |
| `OrderItem` / `CheckoutItem` and every shape derived from them | GONE with their tables |

Routes added or changed are listed in §6.

---

## 6. Routes

| route | change |
|---|---|
| `GET /api/lots` | unchanged URL; refiner lots and sale lots never appear |
| `GET /api/lots/:id` | lineage is `{ sources, derived }`; `worth.settled` is the refiner lot's figures with the shared `share` |
| `POST /api/lots/combine` | now allowed for on-hand customer lots AND for lots already at a refiner through the same refiner lot, re-pointing its batch edges |
| `POST /api/orders/lots/:id/split` | writes a `split` edge per child |
| `PATCH /api/orders/lots/:id` | patches the LOT, and works for a refiner lot |
| `POST /api/orders/:id/lots` | body is `OrderLotLine \| OrderLotPatch`; given `{ lot_id }` on a SALE it mints a sale lot with a `sale` edge from the stock lot, blocked unless that lot is on hand |
| `GET /api/inventory/summary` | reads the new tables and the two filters |
| `POST /api/refining/orders/batch` | **new** — `{ refiner_id, lot_ids? \| order_ids? }` |
| `POST /api/refining/orders/:id/settle` | partial settlement; stamps `settled_spot` server-side |
| `GET /api/refining/orders/:id/spots` | per-metal settled spot, not an order-level frozen price |
| `GET /api/refining/pool` | balance, locked, available |
| `POST /api/refining/pool/locks` | takes `purpose` and an optional `lot_id` |
| `GET /api/orders/:id/adopt_assay` | **new** (admin) — the proposal, pro rata by declared content |
| `POST /api/orders/:id/adopt_assay` | **new** (admin) — the write, taking the figures the employee confirmed, and combining the customer side by default |
| `GET /api/refining/pool/entries` | gains `?entry=credit\|lock` |

---

## 7. The API on the new shape

`pnpm check` passes: **CHECK_EXIT=0**, 44 members, every lint, `api:typecheck`,
the whole test suite (306 files, 1939 tests), `contracts:verify:fresh`,
`contracts:validate`, `api:verify:genesis`, `api:verify:backfill`,
`audit:coverage`, `audit:indexes`, `audit:query-paths`, `audit:constraints`,
`audit:non-finite`, `audit:nullability` and `validate:wire`.

### Inventory

`db/inventory/lot-sources/` is the five-verb repo over the new table — `getFor`,
`sourcesOf`, `link`, `linkMany`, `remove`, `repoint` — exported from `#db` as
`lotSources`. `repoint` is what an after-the-fact combine uses to move a refiner
lot's batch edges onto the combined lot.

`split.sql` writes one `split` edge per child in a data-modifying CTE;
`combine_parents.sql` writes `combine` edges (`markCombined` became
`linkCombined`). `/*__own_lot__*/` is substituted into `list.sql` and
`inventory_by_metal.sql` beside the position expression. `list.sql` and
`view_one.sql` reach the refiner order through the lot's batch child rather than
a direct `refining.lots` join. `view_one.sql`'s lineage is
`{ sources, derived }` with a per-edge `share`; its `worth.settled` reads the
batch child and its `worth.price` is derived.

`rules.assertCombinable` takes `(asked, lots, positions, sources)` and returns
the shared refiner lot or null: on-hand lots combine, and so do lots already at a
refiner **through the same refiner lot** — across two refiner lots it is BLOCKED.

### Refining

`assign.sql` mints the refiner lot, its `batch` edge and the `refining.lots` link
in one statement. `settle.sql` writes the refiner LOT's figures, is
partial-capable, and stamps `settled_spot` server-side for a `paid` order and
never for a `pooled` one. `credit.sql` credits the pool only for a `pooled` sell
order — a `paid` order settles off its stamped spot and never touches the pool.
`view_one.sql` / `view_all.sql` carry `sources` with `share`,
`customer_premium` off the source lot, `settlement_type` and `linked_orders`.
`GET .../spots` reports `{ metal_id, spot, lots, settled_lots }`. The pool
carries `purpose` and `lot_id`, and balances report `balance`, `locked` and
`available`.

`assign.sql` needed one non-obvious shape: `RETURNING` cannot use a window
function, so the refiner lot is correlated to its source by an id read before the
writes rather than by row order. The database still creates the id.

### Orders and pricing

`order_pricing.sql` has no `stored_price`. The spot is direction-aware — bid for
a purchase, ask for a sale — and the premium comes off the lot. `view.sql` and
`view_for.sql` derive `price`, `line_total` and `settled` with the same
expression, so the quote and the order view cannot disagree. `finalize` freezes
`orders.spots` and writes `orders.transactions.total` and stores no price.
`editLot` is one write against the lot, and delegates to `refining.recordAssay`
when the id names a refiner lot. `POST /api/orders/:id/lots` mints a sale lot
with a `sale` edge when the body names a stock lot.

Three latent breaks turned up on the way and are fixed: `order_state.sql`'s
`At Refiner` rung, `profit_breakdown.sql`'s assay CTE and its `ol.premium`
read - all three joined `refining.lots` on the customer lot, which stopped
matching the moment the link repointed at the refiner lot. The fulfillment view's
drop-ship `linked_order` had the same break and now goes refiner lot → edge →
customer lot → order.

**One legacy row forced a decision.** A purchase order on dev has `spots_locked`
true and a frozen `orders.spots` row whose `bid` is NULL for its metal — the lock
never captured that metal. With the price column gone there was nothing to fall
back on and the order became unpriceable, which is a 4xx on a read that used to
work. So a frozen spot that is NULL falls through to the live feed, in all three
expressions. A lock with no number in it is not a lock.

### Guards added or converted (ruling 112)

| rule | class |
|---|---|
| `inventory.assertCombinable` — not on hand, or across two refiner lots | blocked (widened) |
| `orders.assertOnHand` — assigning a lot that is not on hand to a sale | blocked, new |
| `refining.assertBatchGrain` — both or neither of `lot_ids` / `order_ids` | blocked, new |
| `refining.assertOnHandNamed` — a named batch lot that is not on hand (`order_ids` skips instead) | blocked, new |
| `refining.assertPooledHasNoSpot` — a settlement line carrying a spot on a pooled order | blocked, new |
| `refining.assertSettling` — a line naming a lot not on the order | blocked (kept) |
| `refining.assertSettling` — not every held lot named | **confirm** (`settlementConfirm`) |
| `refining.assertSettlementPremiums` — a settling lot with no premium | **confirm** (`premiumConfirm`) |
| `refining.assertLockable` — `troy_oz <= 0` | blocked (kept) |
| `refining.assertLockable` — the balance check | dropped: a pool balance is allowed to go negative, which the code's own comment already said |

`lockConfirm` exists and is not wired: a pool lock is not an action on an order,
so there is no `actions` array to carry its reason. It is in FOLLOWUPS.

### Tests added

`lot-sources/tests/repo.test.ts`; `lots/tests/conservation.test.ts` — content is
conserved through split, through combine and through batch; the two double-count
filters on `GET /api/lots` and `GET /api/inventory/summary`; lineage with
`sources`, `derived` and `share`; `refining/tests/batch.test.ts` — both grains,
the skip list, grain exclusivity, already-batched versus not-on-hand;
partial settlement, the server-stamped `settled_spot`, a pooled order carrying no
spot anywhere, pool credit reading the refiner lot, `available = balance −
locked`, `linked_orders` through the sale edge; `orders/tests/adopt-assay.test.ts`
— the pro-rata allocation and the confirmed-body write; `assign-stock-lot.test.ts`;
and sale-side ask pricing in `db/orders/tests/view.test.ts`.

### Green

- `verify:genesis` — built 71 tables and 6 views from an empty schema, identical
  to dev, and the committed `000_genesis_schema.sql` matches.
- `verify:backfill` — 33 tables, 1370 rows, no undeclared differences, idempotent
  on a re-run, and it still refuses once `exchange` is no longer authoritative.
- `audit:coverage` — three populated columns with no home, all three pre-existing
  (`exchange.products.stock`, `.quantity`, `exchange.scrap.bid_premium`). This
  wave added none: `confirmed` is declared as a rename to `confirmed_at` on the
  purchase side and `price` is declared `DELIBERATE` as derived.
- `audit:constraints` — every guard `exchange` holds is held by the schema that
  replaces it or accepted by name, including two new accepts: a confirmed
  boolean becomes a nullable fact, and a sale-only tax rate cannot be NOT NULL on
  a table that also holds purchase and refiner lots.
