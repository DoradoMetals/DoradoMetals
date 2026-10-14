# Orders port review (2026-10-14)

Four reads of the Orders Figma file `ymmNlCDLVIfanpRQ7QHMIs` (5 base screens, 23 state screens, ~50 components) against the API on `dev` at `06d8bedd`, before any Orders code is ported. Each read is its own file in this folder with a full inventory, node ids and file:line evidence:

| file | scope | facts | gaps | won't work | missing | API changes |
|---|---|---|---|---|---|---|
| `customer-purchase.md` | list screens, PO-2481 and its drawer and profit states | 136 | 15 | 16 | 21 | 15 |
| `customer-sale.md` | SO-1112 and every card it places | 87 | 15 | 15 | 15 | 16 |
| `refiner.md` | RS-2493, RP-2493, settlement, pool, drop-ship, 16 screens | 94 | 24 | 19 | 17 | 14 |
| `cross-cutting.md` | entity header, documents, chat, photos, selection bar, drawers, every status badge, what the operator needs | — | — | — | 14 areas | 14 |

The 2026-10-09 audit (`api-gaps-orders.md`) is mostly closed: of its 80 items in scope, about 45 are closed, 16 partly, 6 superseded, the rest open or waiting on a ruling. The per-file §5 sections carry the item-by-item status.

Reading method: the `figma-design-to-code` skill is not installed in the orchestrator session, so the reviewers read with `get_metadata`, `get_screenshot` and read-only scripts; hidden nodes stayed hidden. Nothing in Figma was changed.

## 1. Wrong today, port or no port

Fix these first; they corrupt facts or expose data now. Two are verified on dev, the rest by reading the code.

1. **Placed sales never lock spots** (`place.ts`, `create_from_checkout.sql`). Verified: all 10 sale orders on dev have `spots_locked = false`, so every read prices their lines at the live ask while Totals shows the stored amounts. Lock at placement; backfill the placed sales.
2. **Sale parcels ship uninsured.** Verified: `logistics/shipping/labels.ts:47` passes declared value `0` for every sale.
3. **Customers can read admin text.** `GET /api/orders/:id` for an owner keeps `actions[]` with confirm text such as "Refiner has not settled 2 of 5 lots" (`orders/rules.ts:225` strips only notes and assignee). Ruling 3.
4. **PDFs are served stale.** `documents/pdfs/serve.ts:66-79` stores the first render and serves it forever, and does not check `available`, so an owner can freeze an invoice before finalize. Render fresh on download; persist only what was sent or imported.
5. **One partial payout reads Completed.** `order_state.sql:66-71` uses EXISTS on a Sent payout, whatever its amount.
6. **A refiner purchase never completes.** `refining_state.sql` has no Completed rung after we pay the refiner.
7. **Inventory double-counts after a refiner lot is removed or the order is cancelled.** Only the `refining.lots` link is deleted; the refiner copy and its `batch` edge remain, pass `own_lot.sql`, and the source lot returns to on hand. Fix is a read filter, no DELETE.
8. **`linked_orders` is empty on the real drop-ship path.** `view_one.sql:168-170` looks for a `sale` edge nothing writes; `supplyOrder` writes `batch`. The test passes only because it inserts the edge by hand.
9. **Fine ounces are summed across metals** on refiner orders (`view_one.sql:228-238`), gold and silver together. The design does the same.
10. **Missing guards:** refiner `assignLots` ignores order state, direction and on-hand; `removeLot` works after settlement; PATCH can change `settlement_type` after settlement; `addFunds` checks for an earlier credit outside its transaction (double credit on two fast clicks); no concurrency precondition anywhere on orders.
11. **The API offers actions it refuses:** `lock_spots`/`unlock_spots` on sales (`PUT /orders/:id/spots` refuses sales); `dispute` on refiner orders (ruled never).

## 2. Design against the law and the data

Where a frame as drawn contradicts a ruling, the lot model or the stored facts. Each needs either a design change or an API change, named per item in the files.

- **Ready to Pay frames (834:21175, 834:21442)** offer Finalize, live lot inputs and a disabled Send payment. Once spots are locked the API offers none of the first two and does offer the third.
- **Spot locks.** The 2026-10-14 ruling (lock only the order's metals, a later metal locks at discovery) is not built: `set_bids_from_feed.sql` locks every row, and placement auto-locks, which collides with lock-on-demand (Q-1 below).
- **Money summed in the browser.** The selection bar's `$… est.` and fine ounces, the Profit card's Profit figure and its Shipping/Payout fee split, and the refiner Totals have no server read. Ruling 75: a pricing read for each.
- **Lot delete on a purchase** calls `DELETE /api/orders/lots/:id`, which deletes the customer's lot row, with no confirm drawn. Data-loss rule.
- **Refiner orders show a spot lock button**; a refiner order has no lock, the spot is set per lot at settlement. Pooled lots show Spot "—" but ruling 123 stamps the market spot.
- **Refiner Send icon on Documents rows**; ruling 15 says email is manual. **Document Delete** is drawn; `media.pdfs` is append-only (ruling needed).
- **The money on the refiner frames does not reconcile** (lot sum 18,674.05 vs Totals 13,346.09 vs payment 17,553.61; sale payment 14,120.00 vs its Total; Expected settlement 14,120.00 against a settlement of 18,204.16). Sample data, but the port will be checked against it.
- **Sale Lots Price cells** do not follow qty × spot × premium and sum to the Total due, not Items.
- **Edits on a charged sale** (qty, premium, shipping, delete) are drawn live; the API has no guard, so the charge and the lots can disagree. Ruling 112 override.
- **Payment card on a sale** shows our receiving bank account; no stored fact holds one. Failed charges and payouts are filtered out of the payment views.
- **Adopt refiner assay drawer** lists scrap names with no lot number (2026-09-22 ruling); the read has no `reference`, name or `line_reference`, and `adopt_assay` is not in `actions[]`.
- **Match settlement lines** matches 2481-A and 2481-B separately; the order holds them as one combined lot, and a combined lot has no `orders.lots` link so it reads "unmatched".
- **Partial settlement.** The confirm text says "X of Y lots are not settled" but the first settle stamps `settled_at` and later settles are refused.
- **Base list (620:5115)** still uses the old two-badge card; the proposed card is only on the porting page (Q-2).
- **Refiner purchase** keeps Send as the primary after it reads Awaiting Delivery; draft frames print RS-/RP- numbers beside Create; one Ship-to select where two sale orders can link; Qty and Pool Oz Remediated drawn editable but derived.
- **`Awaiting Payout` means "not finalized"** today; chip order on 715:38985 differs from the SQL precedence. Header "Pending Assay" vs card "Pending assay". Documents name drift: design "Assay Results", API "Quote Estimate".

## 3. API changes the port needs

Deduped across the four files and ranked. S = a field, a filter or a guard; M = a new read, a migration or a flow.

No ruling needed:

1. Lock spots at sale placement, backfill placed sales (M). Insure sale parcels (S).
2. `orderViewForCustomer` returns `actions: []` and no inbound label (S).
3. Documents: render fresh on download, check `available`, add `size_bytes`, `created_at`, `created_by_id`, direction-aware list (`sales_order_invoice` on sales, no quote estimate, no shipping instructions), one download route per kind for orders and refiner orders (M).
4. Order state: sum payouts against the total; refiner buy reaches Completed (S).
5. Spot locks per the 2026-10-14 ruling: rows only for the order's metals, a lock event per metal, discovery locks, a read of `orders.spot_locks`, refuse money reads for an unlocked metal (M). Stop offering lock actions on sales (S).
6. Selection summary read owned by pricing: lot count, estimated value, fine oz per metal for `order_ids` (S). `RefiningBatch.location_id` (S).
7. Profit breakdown: every order lot, `profit`, `fees` split into shipping and payout fee (M).
8. Payment views: keep Failed rows with the reason; `intent_status`, card brand and last four, `amount_received` on the sale `PaymentView`; retire the query-param passthrough (S).
9. Adopt assay: `reference`, purity name, `line_reference` on the candidate; `adopt_assay` in `actions[]` with a confirm when lots would combine (S).
10. Refiner reads: `own_lot.sql` batch filter; `linked_orders` through the `batch` edge; fine ounces per metal; combined-lot seats through `combine` edges; location on the read and on create; refiner documents per direction (M).
11. Refiner guards: assignLots, removeLot, settlement_type, refiner/location after send; lock the balance row in `addFunds` (S).
12. List reads: lot `name`, `quantity`, `image_id` and `completed_at` on the order list; limit/offset, counts, assignee and sort on the refiner list; refiner orders, tracking and phone in search; pagination on SMS, timeline and inbox (S).
13. `send_payment` override reason on customer orders, recorded on refiner payouts too (S). Customer `send_payment` and the second-payout dialog depend on ruling 5 below.
14. Ruling 114: `POST /shipments/:id/charge` and `/actual_cost` become PATCH fields; guard `PUT /:id/spots {set}` while unlocked or after finalize (S).
15. Remove `dispute` from `actionsFor` (S).

Need a ruling first (see §5): sale cancel with credit release; lot removal as unlink or fact; partial settlement; partial payouts and the amount input; document delete; photo sets and admin access; refunds; address change after a label; signature on delivery; our receiving account; per-order activity read vs field history; order notes; optimistic concurrency; settlement-line parse (the largest single item: a parser per refiner format, writes nothing).

## 4. Missing from the design

States and screens the flow needs that no frame shows. The porter either gets a frame or builds the state code-only and lists it.

- No mobile base for the customer purchase or the customer sale; no mobile Lots (bullion), Payment, Totals or Documents card, so the Import entry to the match drawer is unreachable on mobile.
- No customer-facing order screens at all.
- Empty, loading and error states for every list and card; pagination on the list; confirm dialogs for every confirm-class action; step-up.
- Payment: Failed, the Dorado-balance branch, no bank linked, card declined, partially refunded.
- Order: Cancelled (with reopen) and expired, credit released; awaiting stock, backorder, allocation from inventory on a sale.
- Refiner: partial settlement, disputed assay, returned lots, cancelled batch.
- Operator needs with no frame and no fact: per-order audit trail (who changed what, when), notes with author and time, refunds and chargebacks, parcel claims and insurance, address change after a label, lot photos on intake as a set, customer purity disputes.

## 5. Decisions for Jacob

1. Placement locks spots today. Keep that, or stop locking at placement now that lock-on-demand is the ruling?
2. Port target for the list: the proposed card 673:20375 or the base 620:5115?
3. Header badge on the four base customer headers: on or off (the API always has a state)?
4. `Awaiting Payout` means "not finalized": keep the label or rename it? A Cancelled chip on the state row?
5. Partial payouts: a real case (then an amount input on the Payment card and the "above the total" dialog), or not?
6. Admin cancel of a sales order (ruling 88's cancel half): build it.
7. Removing a lot from a purchase: unlink and keep the lot, or a removal fact. Never delete.
8. A return: its own fulfillment, or always the cancel path?
9. Partial settlement: order stays open until every lot settles, or the first settle closes it?
10. Pooled-sale totals: dollars or ounces, and where the refiner fee shows.
11. Refiner-lot Qty: display only, or editable in the API?
12. Document delete: only an unsent import, or a supersede that keeps the row? Refiner document Send: build it or remove the icon?
13. Photos: one per lot or a set, per lot or per order, and who may view (admins cannot open each other's today).
14. Audit trail: a read over existing facts, or field-level history? Notes: one text column, or `crm.notes` with `order_id`?
15. Refunds (card only, or also to credit), parcel claims, address change after a label (and the sales-tax re-quote), signature on delivery, our receiving account on the Payment card: in scope or out. Each needs a fact before a screen.
16. Concurrency: a precondition on edits, or last-write-wins?
17. Context menu 619:4750 contents; selection bar label (Batch into vs Send to) and any bulk action beyond Batch.
18. Mobile and the state frames in §4: designed before the port, or built code-only by the porter and listed?
19. Messages per order: confirm the customer-thread default.
20. `docs/rulings.md` stops at 96; rulings 97-126 are being written in from the lane docs. Confirm the text once it lands.

## 6. Proposed port order

0. **Defects and rulings.** §1 fixes as one API lane (no screens). Jacob answers §5; the answers become rulings 127+.
1. **Shared shell.** Entity Header, Documents, Chat, Drawer, Selection actions, Order State badge, the photo viewer, the list filters: every order kind places them, so they port once, against the Library mains, with the cross-cutting API changes.
2. **List and customer purchase order** (the most used screens): list reads, spot locks per the ruling, profit breakdown, adopt assay, payment view.
3. **Customer sales order:** sale lock and insurance land in phase 0; then documents per direction, payment card states, sale cancel, charged-sale guards.
4. **Refiner sale and purchase:** refiner reads and guards, settlement per the ruling, drop-ship linking, the settlement-line parse last.

Each phase is one lane with the design-omission list in its report, as the Pricing and Media ports were done.
