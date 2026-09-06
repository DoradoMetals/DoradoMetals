# The lots build

Ruling 98, executed. `docs/model/lots.md` was a write-up with twelve open
questions; this is what exists now, what it replaced, and what is left.

Jacob, 2026-09-08: *"do the lots/refiner stuff. Where order items are lots and
can map to refiner orders. Where any given customer order can send lots to
multiple refiner orders."*

## The shape

**One table of physical things, three link tables that carry only the money of
their own stage, and a refiner side that is the business's own orders.**

| table | what it is |
|---|---|
| `lots.items` | the physical lot. Minted once, in the basket; its id is the id the refiner settles. |
| `checkout.lots` | the basket link. `lot_id UNIQUE`. |
| `orders.lots` | the customer order link: premium, price, sales tax, confirmed. `lot_id UNIQUE`. |
| `refining.orders` | the business's own order to a counterparty, with its own number, direction and settlement. |
| `refining.lots` | the refiner's assay and premium for one lot. `lot_id UNIQUE`. |
| `refining.pool` | the metal a refiner owes us, as an append-only signed ledger per refiner per metal. |

`lot_id UNIQUE` in all three link tables is what "the id survives" means: a lot
sits in one basket, on one order, at one refiner. No foreign key joins a
refining order to a customer order (ruling 42) — the join is the lot, one hop.

**Directions.** A customer PURCHASE (we buy) feeds a refiner `sell` order — our
metal goes out to be refined. A customer SALE of bullion is filled by a refiner
`buy` order, drop-shipped. `refining.orders.direction` carries both, and
`one_open_sell_order_per_refiner` is the pooling mechanic stated as a partial
unique index: lots accumulate onto the one open sell order per refiner until it
is sent, so one customer order splits across refiners and one refiner order
holds lots of several customer orders. `POST /api/refining/orders` reads that
order before it writes, so a second one is a 409 naming the order the caller
should be adding to rather than a 23505 carrying an index name.

## The one correction to `docs/model/lots.md`

The write-up makes `content` a generated column derived as
`coalesce(post_melt, pre_melt) * conversion * purity`, and gates migration 135
on `products.bullion.content = gross * purity` holding across the catalogue.

**Measured on dev 2026-09-08: that identity holds for ONE of 62 catalogue rows.**
`products.bullion.content` is the ADVERTISED FINE content and `gross` is the
gross weight; for 61 rows the two are equal and `purity` is the fineness of the
metal. Deriving a catalogue lot's content would apply purity a second time —
exactly the defect migration 134 was written to remove, and an 0.1%–8.3%
understatement on every bullion line ever placed.

So a catalogue lot SNAPSHOTS its fine content into `lots.items.content_snapshot`
(ruling 51) and `content` generates from it; a scrap lot has no snapshot and
generates from its own weights through `metals.fine_content`, the one
definition. One expression, in the database, indexable, and impossible for two
reads to disagree about — question 8's recommendation, reached without
question 12's value change.

Measured after 161 ran: **81 of 81 catalogue lots reproduce their content
exactly**; 7 of 22 scrap lots do; the other 15 move by rounding only, the
largest by 4.75e-4 t oz, because their stored content had been rounded to three
decimals at write time. 161 refuses to commit if any lot moves by more than
1e-3 t oz.

## Migrations

| # | what |
|---|---|
| 160 | `lots` and `refining` schemas, six tables, two enums, the sequence, the checks, the indexes, the `audit_stamp` triggers |
| 161 | every `orders.items` row becomes a lot KEEPING ITS ID, plus its `orders.lots` link; asserts the whole population's content |
| 162 | the same for `checkout.items` |
| 163 | the 31 engagements that name a refiner become `refining.orders`, KEEPING THE ENGAGEMENT'S ID, and their `refiners.items` become `refining.lots` |
| 164 | 163's corrected body, guarded, because 163 had already run on dev when its linkage was fixed |
| 165 | `pool_oz_deducted` / `pool_remediation` become a `lock` and a `credit` entry citing their order |
| 166 | `orders.assigned_to_id`, the `DROPOFF` fulfillment category and `fulfillments.dropoffs`, `fulfillments.refining_order_id`, and the seven new `media.pdf_kind` labels |
| 167 | the Drop-off method row (its own file: Postgres refuses to USE an enum label in the transaction that added it) |

Every one is additive. `exchange` is untouched throughout, and `lint:migrations`
is green. Genesis and the contracts are regenerated; `verify:genesis` builds all
twenty schemas from nothing and matches dev.

Two changes to `scripts/dump-schema.mjs` were needed and are general, not
lots-specific: it now emits **STORED generated columns** as such rather than as
a DEFAULT (which Postgres refuses, because a default cannot name a column), and
it emits **standalone sequences**, before the tables, alongside the functions —
a generated column resolves its function at CREATE TABLE time and a column
default resolves its sequence there too.

## Routes

| method | path | guard | answers |
|---|---|---|---|
| GET/PUT/DELETE | `/api/checkout/lots` | requireUser | `Lot[]` |
| GET | `/api/orders/:id/lots` | requireUser + own | `OrderLotView[]` |
| POST | `/api/orders/:id/lots` | requireAdmin | 201 `OrderLotView` |
| PATCH | `/api/orders/lots/:id` | requireAdmin | `OrderLotView` |
| DELETE | `/api/orders/lots/:id` | requireAdmin | 204 |
| POST | `/api/orders/lots/:id/split` | requireAdmin | 201 `OrderLotView[]` |
| POST | `/api/orders/:id/finalize` | requireAdmin | `OrderView` |
| POST | `/api/orders/:id/reopen` | requireAdmin | `OrderView` |
| POST | `/api/orders/:id/supply` | requireAdmin | 201 `RefiningOrderView` |
| GET | `/api/orders/:id/documents` | requireAdmin | `OrderDocument[]` |
| GET/POST | `/api/refining/orders` | requireAdmin | `RefiningOrderView[]` / 201 |
| GET/PATCH | `/api/refining/orders/:id` | requireAdmin | `RefiningOrderView` |
| POST | `/api/refining/orders/:id/send` | requireAdmin | `RefiningOrderView` |
| POST | `/api/refining/orders/:id/settle` | requireAdmin | `RefiningOrderView` |
| GET/POST | `/api/refining/orders/:id/lots` | requireAdmin | `RefiningLot[]` |
| PATCH/DELETE | `/api/refining/lots/:id` | requireAdmin | `RefiningLot` / 204 |
| GET | `/api/refining/pool` | requireAdmin | `PoolBalance[]` |
| GET | `/api/refining/pool/entries` | requireAdmin | `PoolEntry[]` |
| POST | `/api/refining/pool/locks` | requireAdmin | 201 `PoolEntry` |
| GET | `/api/suppliers/get_all` | requireAdmin | `RefinerView[]` (re-mounted under `refining`) |

`send` and `settle` are earned actions: one closes an order to further lots, the
other is non-idempotent business logic writing four tables in one transaction.
`POST /api/orders/:id/supply` is the composite ruling 26b prescribes — the URL
is the customer order's because that is the id the caller holds; the handler is
`refining/controller.ts` because that domain owns the tables.

`POST /api/orders/:id/finalize_pricing` is now `/finalize`, and
`POST /api/orders/:id/send_to_refiner` is now `/supply`.

## What died

- **Tables' code, not the tables.** `orders.items`, `checkout.items`,
  `refiners.items`, `refiners.orders` and `refiners.spots` still hold every row
  they held; nothing reads or writes them any more. Dropping them is a later
  migration, one release after these reads have run.
- `api/src/db/orders/items/**`, `db/checkout/items/**`, `db/refiners/items/**`,
  `db/refiners/orders/**`, `db/refiners/spots/**`.
- `api/src/domains/orders/items/**` and `domains/orders/refiners/**` (11 files),
  rewritten from the inputs inward as `domains/refining/**`.
- The contracts `OrderItem`, `OrderViewItem`, `OrderItemPatch`, `OrderItemWrite`,
  `CheckoutItem`, `CheckoutItemPatch`, `CheckoutBullionLine`,
  `CheckoutScrapLine`, `OrderLine`, `SoldLinePrice`, `RefinerItem`,
  `RefinerItemPatch`, `RefinerOrder`, `RefinerOrderPatch`, `RefinerOrderView`
  and `RefinerSpot` are gone from every consumer.
- `orders.transactions.refiner_fee` is no longer read: `profit_breakdown.sql`
  sums `refining.orders.fee` over the orders the lots actually went to.
- **`refiners.spots` as a price feed.** Dorado's and the refiner's ounces are
  now valued at the pool's most recent `lock` price for that refiner and metal
  at or before the settlement, falling back to the live bid — question 9's
  recommendation, and the one number in the profit report that moves.
- **The basket's premium.** Nothing read it: the purchase quote prefers the rate
  band, the sale quote reads the product, and placement takes the premium from
  the quote. `checkout.lots` has no premium column and the write that filled one
  is gone (question 11).

## What the design notes added beyond lots.md

From Jacob's Sep 4–5 notes and the Figma Orders/Inventory files:

- **`orders.orders.assigned_to_id`** and `refining.orders.assigned_to_id` — the
  header's Assigned-to select.
- **Reopen** — `POST /api/orders/:id/reopen`, offered only on a cancelled order,
  putting it back at `Received`.
- **The Finalize gate, written down and enforced.** `rules.finalizeBlockedBy`
  returns what Finalize is waiting on in the operator's words, `actions`
  carries it as `finalize_blocked_by`, and the endpoint refuses on the same
  list. Confirming a lot is the admin saying the metal arrived and the declared
  weights hold, so the handover condition is read off the lots rather than off
  a status — a status is a pure label and drives nothing (ruling 2).
- **Settlement** — `refining.orders` carries `assay_lab`,
  `expected_settlement_on`, `settled_at` and `disputed_at`; the view derives
  `state` (Pending assay → Settled → Disputed), `estimated_content`,
  `settled_content`, `variance` and `pool_oz`. None of the five is a column.
- **Pool Oz Remediated** — the Charges line reads `pool_oz`, the sum of the pool
  entries citing that refiner order, in troy ounces.
- **Drop-off** — a fulfillment category and `fulfillments.dropoffs` (driver,
  refinery, window, `departed_at`, `dropped_off_at`). Its states are the two
  timestamps, not a status column. `fulfillments.fulfillments.refining_order_id`
  lets a handover belong to a refiner order, with a CHECK that it is one order
  or the other and never both.
- **Documents by method** — `rules.documentsFor` names the ten canonical
  documents per handover category and says which are available; an Invoice is
  unavailable until the order is finalized. `GET /api/orders/:id/documents`
  answers it. Rendering the six new ones is a later documents lane.
- **A lot's name, form and reference** — the Inventory file's Lot Row is Item ·
  Form · Post melt · Purity · Fine oz · Assigned to · Value, with the lot id
  reading `Lot 2481-A`. All four are derived in the view: `form` is 'Scrap' or
  the product's own type, `reference` is the order's number plus a letter per
  lot in placement order, and `refining_order_number` is the Assigned-to badge.
  `lots.items.image_id` carries the row's photo.

## The frontend this implies, and does not build

Nothing under `frontend/` changed. `@dorado/client` did, because it is the
API's typed surface and the API's shapes moved:

- `useCheckoutItems` / `useReplaceCheckoutItems` / `useClearCheckoutItems` →
  `…Lots`, against `/api/checkout/lots`, body key `lots`.
- `useOrderItems` → `useOrderLots`; `useCreateOrderItem` / `usePatchOrderItem` /
  `useDeleteOrderItem` → `…OrderLot`, plus `useSplitOrderLot`.
- `useFinalizePricing` → `useFinalizeOrder`, plus `useReopenOrder` and
  `useOrderDocuments`.
- `useSendToRefiner` → `useSupplyOrder`; the whole `refiners` module is now
  `refining`, with order, lot and pool hooks.

The frontend calls these hooks and will not typecheck until it is updated —
which is its own pass, after the API (ruling 44). The gate runs no frontend
member, so this does not block a merge.

**Wire shapes that moved**, for that pass: `OrderView.items` → `OrderView.lots`,
each row `{ …link, lot: { …physical facts, product_name, form, reference },
payable, line_total, settled, refining_order_number }`; `CheckoutView.items` →
`.lots` (bare `Lot` rows, no premium); `CheckoutStep` `'items'` → `'lots'`;
`OrderActions` loses `finalize_pricing`, `send_to_refiner` and `edit_lines` and
gains `finalize`, `finalize_blocked_by`, `reopen`, `supply`, `edit_lots` and
`assign_lots`.

## The seam the rails lane needs

`docs/waves/payment-rails.md` does not exist yet, so nothing here consumes it.
Two named places are ready for it:

1. **`refining.orders` has no payment columns and should not grow any.** A
   refiner order's money is `fee`, `statement_reference` and the pool; what it
   is PAID by belongs on `orders.transactions`/`payments.*` the way a customer
   order's does. When the rails lane gives a refiner order a payment state, the
   seam is a `refining_order_id` on the payments side, not a status here.
2. **`OrderActions` is where a payment state becomes a button.** The notes'
   section 6 states Payout `Not sent → Processing → Sent` and Charge
   `Due → Processing → Received`; `rules.actionsFor` already computes every
   other action from facts and is the one function that has to learn them.

## What is left

- **`orders.items`, `checkout.items`, `refiners.*` are not dropped.** That is
  one migration, deliberately not written here — a release after these reads
  have actually run.
- **The five new documents do not render.** Only their names, their availability
  and their Send/Import split exist.
- **Drop-off has no service, controller or routes.** The table, the category and
  the method row exist; booking one is the logistics lane's own pass, and it
  wants `fulfillments/dropoffs/**` beside `pickups` and `directs`.
- **Linked Fulfillment is not built.** The notes make it a READ of the linked
  order's shipment state; the link exists (the lot is on both orders), the read
  does not.
- **A lot has no life away from an order.** `lots.md` section 3 says make it an
  `inventory` domain when lots gain storage; the Inventory Figma file's lot
  list, filter rail and Combine action all want that, and none is built.
- **`refining.pool` has no correction endpoint.** The table is append-only by
  design and a correction is a compensating entry; nothing writes one yet
  except `POST /refining/pool/locks`.
