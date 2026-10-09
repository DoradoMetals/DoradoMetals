# Orders reads (lane `orders-reads`, 2026-10-09)

Source: `docs/design/api-gaps-orders.md` §1 (26 rows) and §2. Jacob loves the
Orders screens; this wave gives them the reads they draw. Rulings as in
`docs/waves/leads-api.md` "Rulings that bind this lane". Defaults adopted
here for the audit's open questions: the list-header `New lot` button is
dropped (a lot needs an order); a refiner order with `sent_at IS NULL` is
`Draft` (today it reads Pending assay / Awaiting Delivery); FedEx `AR` maps
to a tracker stage `Arrived`; sort keys are rows in `orders.list_sorts`.

## Scope, in the audit's row order

1. **List filters and envelope** (rows 1–5, 7, 8): `GET /api/orders` gains
   `state=`, `assigned_to_id=` (with `unassigned`), `has_unassigned_lots=`,
   `sort=`, and pagination; the response envelope carries `orders` and
   `unassigned_lots` counts; each list item carries `lot_count`,
   `arrived_at` / `placed_at`, and `estimated_value` computed by a pricing
   SQL view over the order's lots (never TypeScript arithmetic). Indexes for
   every new WHERE (`audit:query-paths` must stay green).
2. **Order Card lot rows** (row 6): each list item carries up to three lots
   `{number, product_name, weight, purity, destination}` plus `more_count`,
   built in SQL.
3. **Search** (row 9): `GET /api/search?q=` returning flat typed hits across
   orders, customers, leads and lots (`kind, id, reference, title`), one SQL
   statement per kind unioned, admin-only.
4. **Order State** (rows 11, 12): one `OrderState` enum in contracts covering
   customer and refiner states; the refiner `state` stops being
   `z.string()`; `refining_state.sql` gains the Draft rung.
5. **Settlement reads** (rows 13–15, 24): adopt-assay proposal rows carry
   `product_name`, `form`, `metal_id`; `inventory.lots.line_reference text`
   on the refiner lot (migration) for the refiner's invoice-line reference;
   per-lot settlement price from a pricing SQL view (`content × settled_spot
   × premium`); the match-settlement-lines read returns the invoice lines
   with their pre-match (`matched_lot_id`, `status unmatched | not_on_invoice
   | extra_on_invoice`) derived in SQL.
6. **Profit Breakdown** (rows 16–19): top-level `payout` and `fees`, and a
   per-lot `lots[]` with `settled_at`, `settled_spot`, `value`, `estimated`;
   the `total_lots` denominator counts the lots the card lists.
7. **Linked orders** (row 20): `linked_orders[]` carries the customer name,
   city and the fulfillment's derived stage.
8. **Refiner order money** (rows 21–23): a `shipping` term in
   `refining.order_money` from the refiner leg's shipment cost;
   `pool_oz_remediated` (ounces) beside the dollar figure; `REFINING_DOCUMENTS`
   becomes rows (`media.pdf_kind` already has `invoice`, `settlement`,
   `packing_list`, `shipping_instructions`) and the read lists all four.
9. **Sales order pricing** (row 25, a money bug): `order_pricing.sql` applies
   purchase arithmetic to sales; a sale is `bullion + shipping + sales_tax −
   credit_applied = total due`, with the rows the Totals card draws. Prove it
   with a test against a placed sale with credit.
10. **Tracker** (row 26): `Arrived` stage mapped from FedEx `AR`.

Migrations `api/migrations/260_*.sql` onward. Worktree
`/home/jtj60/dorado-lanes/orders-reads`. Mechanics as in the other waves.
