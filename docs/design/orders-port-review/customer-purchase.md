# Orders port review: the list and the customer purchase order

Read live on 2026-10-14 (about 21:30Z) from the Figma file `ymmNlCDLVIfanpRQ7QHMIs`. Pages: `Orders` 660:10613 and `Order states · for porting` 1157:22583. Compared with the API on `dev` in this worktree. Docs only. No code was changed.

**Method.** The `figma-design-to-code` skill is not installed in this session, and the MCP resource fallback cannot be read with the tools here. So `get_design_context` was **not** called. I listed the frames with `get_metadata` and read every value from `get_screenshot` renders. A render shows only visible nodes, so this review reads hidden nodes as hidden. Node ids are the screen-level instance (from metadata) or the component main. A value is the rendered text.

**Rulings source.** `docs/rulings.md` stops at ruling 96 (its §Numbering says "Every number from 1 to 96"). Rulings 97-126 are not in the law file. I cite them from where they are written: `docs/waves/facts-and-positions.md` (112-114), `docs/waves/lot-model.md` (120-121), FOLLOWUPS (117, 123, 125), `docs/design/orders-comments-log.md` (2026-10-14 rulings). **Add 97-126 to `rulings.md`** before the port, so the port has one law file.

Key: **OK** = backed, **GAP** = missing, **WW** = won't work as drawn. "View" is `GET /api/orders/:id` (`OrderView`). "Pricing" is `POST /api/quotes/order` (`OrderPricing`). "List" is `GET /api/orders` (`OrderList`).

---

## 0. Screens in scope

| # | Node | Screen | Page | Kind |
|---|---|---|---|---|
| L1 | 620:5115 | Admin / Orders & Lots (Purchases, 2 selected) | Orders (base) | list, desktop, **old card** |
| L2 | 673:20375 | Admin / Orders · state chips | porting | list, desktop, **proposed card** |
| L3 | 917:13005 | Mobile · Orders & Lots | porting | list, mobile |
| L4 | 620:5789 | Orders & Lots - Sales | porting | list, desktop |
| L5 | 634:12204 | Orders & Lots - Refiners | porting | list, desktop |
| L6 | 634:13082 | Orders & Lots - Completed | porting | list, desktop |
| P1 | 168:2022 | Admin / Purchase Order - PO-2481 | Orders (base) | purchase, desktop |
| P2 | 834:21175 | PO-2481 · Profit Breakdown (Ready to Pay) | porting | purchase, desktop |
| P3 | 834:21442 | Mobile · Profit Breakdown | porting | purchase, mobile |
| P4 | 729:35427 | PO-2481 · Adopt refiner assay (Drawer LG 1160:22722) | porting | purchase, desktop, drawer |
| P5 | 729:36280 | Mobile · Adopt refiner assay (Drawer Full 1160:23218) | porting | purchase, mobile, drawer |

Components read for scope: Order Card 618:4776, Order Card · proposed 671:28586 / Mobile 671:28777, Filter Bar (A) 626:11861, Filter Bar · proposed 715:38985, Filter Rail 619:4639, Order Context Menu 619:4750, Selection actions 1035:21970, Order State 664:12789, Spots 170:2226, Lots 170:2260, Lots Row 152:548, Lots / Adding Lot 326:9499, Lots · proposed 729:17246, Charges 170:2277, Payment 170:2316, Totals 170:2346, Profit Breakdown 170:2373, Profit Breakdown · proposed 833:21320, Fulfillment 209:3010, Create Fulfillment 237:4619, Shipment 179:2460, Return Shipment 296:5324, Pickup 184:2846, Appointment 195:2924, Drop-off 319:5963, Adopt body 1048:32236 / 1048:32375, Payout override 1088:22690 / body 1088:22538.

---

## 1-2. Inventory and source, per screen

### L2 673:20375: the proposed list (the port target. See WW-1 about L1.)

| Item | Node | Source | Status |
|---|---|---|---|
| Tabs Orders · Inventory · People · Pricing | 848:32451 | frontend routes | OK |
| Title `Orders & Lots`, description line | 848:32451 | static copy | OK |
| Chips `Purchases` / `Sales` | 848:32451 | List `?direction=purchase\|sale` | OK |
| Breadcrumb Admin > Orders > Purchases | 848:32451 | route | OK |
| Search `Search orders, customers, lots…` | 848:32451 | `GET /api/search?q=` (admin, at least 2 characters, prefix only, `SearchHit {kind,id,reference,title}`) | OK (prefix only. Infix matching waits on the `pg_trgm` grant.) |
| `Show: Unassigned` select | 673:20385 | List `?has_unassigned_lots=true`. No value list is defined for the other options. | OK for one option. GAP: the option set (see WW-6) |
| `Assigned to: Anyone` select | 673:20385 | List `?assigned_to_id=<uuid>\|unassigned` and `GET /api/employees` | OK |
| `Sort by: Newest first` select | 673:20385 | `GET /api/orders/sorts` (8 rows from `orders.list_sorts`) and `?sort=` | OK |
| `Reset` | 673:20385 | client state | OK |
| `6 orders · 18 unassigned lots` | 673:20385 | `OrderList.counts.{orders,unassigned_lots}` | OK |
| State chips All · Awaiting Receipt · Awaiting Payout · At Refiner · Ready to Pay · Completed | 673:20385 | List `?state=` (repeatable, `OrderState`) | OK. No `Cancelled` chip (M-12). |
| Card reference `PO-2481` | 673:20388 | item `reference` | OK |
| Card customer name | 673:20388 | item `customer.name` | OK |
| Card state badge (`Awaiting Payout` …) | 673:20388 | item `state` | OK |
| Card checkbox (select) | 673:20388 | client state | OK |
| Lot row thumbnail | 673:20388 | GAP: the list lot has no `image_id` | GAP |
| Lot row name `14K Gold` / `Sterling` | 673:20388 | list lot has `product_name` (null for scrap) and `form`. It has no purity-label `name`. | GAP: add `name` (same expression as `view.sql`) |
| Lot row ref `2481-A` | 673:20388 | list lot `reference` = `Lot 2481-A` | OK (the card drops the word "Lot") |
| Lot row `210.5 g · 41.7%` | 673:20388 | list lot `weight` (= `COALESCE(post_melt,pre_melt)`), `unit`, `purity` | OK |
| Lot row `Qty 3 · 99.9%` (bullion) | 673:20389 | GAP: list lot has no `quantity` | GAP |
| Greyed row `on RS-2501` / `on SO-1118` | 673:20388 | list lot `destination` (prefixed RP/RS/SO/PO) | OK |
| `+2 more` | 673:20390 | item `more_count` | OK |
| Footer `5 lots · $18,420 est.` | 673:20388 | item `lot_count`, `estimated_value` (pricing `order_value.sql`) | OK |
| Footer `Received Sep 2` | 673:20388 | item `arrived_at` | OK. WW-4 on Awaiting Receipt cards. |
| Selection bar `2 orders selected · 10 lots` | 673:20394 | client count of selected cards and their `lot_count` | OK |
| Selection `$15,532.70 est. · 6.18 oz fine gold · 0.31 oz fine platinum · 33.6 oz fine silver` | 673:20394 | none | GAP / WW-3 (the frontend would sum money) |
| Selection `Batch into: Elemetal · Dallas` | 673:20394 | `GET /api/refiners` (refiner + location) | partial: `RefiningBatch` takes `refiner_id` only. It has no `location_id`. |
| `Batch` button | 673:20394 | `POST /api/refining/orders/batch {refiner_id, order_ids}` | OK (`order_ids` exists) |

### L1 620:5115: the base list (old card)

| Item | Node | Source | Status |
|---|---|---|---|
| Same header, search, Assigned to, Sort, counts as L2 | 687:13885 | as L2 | OK |
| `Showing: Customers / Refiners` segmented | 687:13885 | Customers = `GET /api/orders`. Refiners = `GET /api/refining/orders` (another endpoint, another shape). | WW-2 |
| Card two badges `Not sent` + `In Transit` / `Not set` / `Sent` + `Delivered` | 620:5300…620:5685 | GAP: the list item has no payout state and no shipping status | superseded by `state` (L2) |
| Footer `4 unassigned · $13,346.09` | 620:5300 | `$13,346.09` is the finalized total (`totals.total`). "4 unassigned" per order has no field (counts are only list-wide). | GAP / superseded by L2 footer |
| Footer `Received Sep 2` | 620:5300 | `arrived_at` | OK |
| Selection bar (same as L2) | 620:5758 | as L2 | as L2 |

### L3 917:13005: mobile list

| Item | Node | Source | Status |
|---|---|---|---|
| Tabs, title, `6 orders · 18 unassigned lots` (twice) | 917:13054 | `counts` | OK (printed twice) |
| `Purchases` / `Sales` | 917:13054 | `?direction` | OK |
| `Search…` | 917:13054 | `/api/search` | OK |
| `New order` button | 917:13054 | `POST /api/orders/admin` (`AdminOrderCreate`) | OK. Desktop has no matching button (M-15). |
| Show / Assigned to / Sort by / Reset | 917:13054 | as L2 | OK |
| State chips (6, scroll) | 917:13194 | `?state=` | OK |
| Cards PO-2481… (proposed mobile card, 5 lot rows + `+3 more`) | 917:13214 | list caps `lots` at 3 | WW-5 |
| Selection sheet `2 orders selected · 10 lots`, `$15,532.70 est. · …` | 917:13507 | none | WW-3 |
| Selection `Send to: Elemetal · Dallas`, `Batch` | 955:15753, 917:13510 | batch endpoint | label drift: desktop says `Batch into` (api-gaps §2.16 said it was fixed. Mobile still says `Send to`.) |

### L4 620:5789 Sales, L5 634:12204 Refiners, L6 634:13082 Completed (old card)

| Item | Node | Source | Status |
|---|---|---|---|
| L4 breadcrumb `Sales` while chip `Purchases` is selected | 620:5789 | none | design error (chip state) |
| L4 `Show: Open`, `Sort by: New` | 620:5789 | `?state=` repeat (Awaiting Payment, Preparing, In Transit) and sort `newest` | OK. The label `New` drifts from the `Newest first` row. |
| L4 `3 orders · 6 to source`, footer `3 to source · $19,818.49`, `Ordered Sep 5` | 620:5789 | GAP: no "to source" count (sale lots without a `sale` edge). `placed_at` is OK. | GAP (sale, out of purchase scope) |
| L4 badges `Due`/`Paid` + `Awaiting tracking`/`Not set` | 620:5789 | superseded by `state` | superseded |
| L4 select `New purchase from Elemetal · Dallas` + `Batch` | 620:5789 | `POST /api/orders/:id/supply {refiner_id}` (one order per call) | partial: there is no multi-order supply |
| L5 refiner orders with reference `PO-2495`, `PO-2493`… | 634:12204 | `view_all.sql` emits `RP-`/`RS-` | WW-2 (ruling 125) |
| L5 `Elemetal · Dallas` subtitle, `Not sent`/`Sent` + shipping badges, `N unassigned`, `Received Sep 6` | 634:12204 | `/api/refining/orders` view, not the order list | WW-2 |
| L5 `Customers` / `Refiners` radio chips draw a stray radio dot | 634:12204 | component | design defect |
| L6 `Show: Completed`, `Sort by: Newest`, `4 orders · all lots assigned` | 634:13082 | `?state=Completed`, `counts.unassigned_lots = 0` | OK |
| L6 footer `All lots assigned · $13,346.09`, `Completed Aug 26` | 634:13082 | GAP: no `completed_at` on the list item | GAP (R-6) |

### List components

| Item | Node | Source | Status |
|---|---|---|---|
| Order State: 14 variants | 664:12789 | `OrderState` (14 values, `packages/contracts/src/computed/orders.ts`) | OK. Only 6 are reachable for a purchase. |
| `State=Draft` renders an empty outline with no label | 664:12783 | none | design defect |
| Filter Rail: Show, **Payment**, **Fulfillment**, **Metal**, Assigned to, Sort chips Newest/Oldest/Value/Lots, count, Reset | 619:4639 | GAP: the list has no `payment`, `fulfillment` or `metal` filter. Sort keys exist. | GAP, or drop the rail (it is placed on no screen in scope) |
| Order Context Menu: `ORDER PO-2189`, `Edit details` ×2, `Delete address` | 619:4750 | none | WW-8 |
| Filter Bar (A) / proposed: Showing toggle, Show `Orders with unassigned lots`, chips | 626:11861, 715:38985 | as L1/L2 | as above |
| Order Card · proposed Sale variant `Placed Sep 2`, `4 lots · $8,410 est.` | 671:28494 | `placed_at`, `lot_count`, `estimated_value` | OK |

### P1 168:2022: the base purchase order (desktop)

| Card · item | Node | Source | Status |
|---|---|---|---|
| Header eyebrow `PURCHASE ORDER` | 1108:22878 | View `order.direction` | OK |
| Header state badge: **none on the base screen** | 1108:22878 | View `state` | M-1 |
| Name `Marguerite Whitfield` | 1108:22878 | View `user.name` | OK |
| `PO-2481 · Austin, TX` | 1108:22878 | View `reference`, `address.city/state` | OK |
| `7 orders to date` | 1108:22878 | View `user.orders_to_date` | OK |
| `Assigned to: Dana Whitlock` select | 1108:22878 | `order.assigned_to_id` + `GET /api/employees`. Write: `PATCH /api/orders/:id {assigned_to_id}`. | OK (the name is resolved from the employees list) |
| `Cancel` (danger) | 1108:22878 | `actions[cancel]`, `POST /api/orders/:id/cancel` (buys a FedEx return label after commit) | OK. M-5 (no confirm). |
| `Finalize` (primary) | 1108:22878 | `actions[finalize]` + `confirm`, `POST /:id/finalize` | OK. WW-10 (offered only while unlocked). |
| Shipment badge `Delivered` | 179:2571 | `GET /api/orders/:orderId/shipments` -> `ShipmentView.tracking_status` | OK |
| `Tracking # 7948 1234 5678` | 179:2571 | `shipment.tracking_number` | OK |
| `Delivered Sep 3, 2:41 PM` | 179:2571 | `shipment.delivered_at` | OK |
| Tracker: 5 stages Picked Up · Arrived · In Transit · Out for Delivery · Delivered, each with city + time | 179:2571 | `ShipmentView.timeline[] {stage,location,scan_time,reached}`, `TRACKING_STAGES` now includes `Arrived` | OK |
| Spots title + lock icon button | 152:837 | `PUT /api/orders/:id/spots {lock}` (admin), `actions[lock_spots\|unlock_spots]` | OK. WW-9 (lock scope). |
| Spots `Gold 2,411.2 $`, `Silver 29.14 $` (inputs) | 152:837 | `GET /:id/spots` `bid`, or Pricing `spots[]`. Write: `PUT … {set:[{metal_id,bid}]}`. | WW-9 (the inputs are editable while unlocked) |
| Lots title, `+` add, combine icon, delete icon | 152:882 | add `POST /:id/lots` (`OrderLotPatch`). Combine `POST /api/lots/combine`. Delete `DELETE /api/orders/lots/:id`. | OK. WW-11 (delete), M-7. |
| Lots header checkbox + row checkboxes | 152:882 | client selection | OK |
| Columns Item · Qty · Pre Melt · Post Melt · Purity · Premium · Price | 152:882 | `OrderLotView.name`, `lot.quantity`, `lot.pre_melt`, `lot.post_melt`, `lot.unit`, `lot.purity`, `lot.premium`, `line_total` | OK |
| Row `14 Karat Gold / Lot 2481-A`, `142.5 g`, `139.22 g`, `56.3 %`, `92 %`, `$5,102.40` | 152:882 | as above. Edits: `PATCH /api/orders/lots/:id` (`OrderLotPatch`). | OK. WW-10 (edit while locked). |
| Bullion row `1 oz Gold American Eagle / Lot 2481-D`, Qty `2`, `—` ×3, `99 %`, `$4,701.84` | 152:882 | `name` (bullion name), `quantity`, `line_total` (`price × quantity`) | OK |
| Charges `Payout Charge 12.50 $` (input) | 152:1128 | `totals.payout_fee`. Write: `PATCH /api/payments/details/:id {cost}`. | OK |
| Charges `Shipping Charge 24.00 $` (input) | 152:1128 | shipment `cost`. Write: `POST /api/shipments/:id/charge {shipping_charge}`. | OK. A column edit as a POST action breaks ruling 114 (R-12). |
| Payment badge `Not sent` | 452:12248 | `GET /api/payments/view/:orderId` `state` (admin) | OK. M-9 (Failed is hidden). |
| `Account name`, `Bank`, `Account type`, `Routing •••• 5679`, `Account •••• 4417` | 452:12248 | View `payout.{account_holder_name,bank_name,account_type,routing_last4,account_last4}` | OK (last 4 only) |
| `Amount $13,346.09` | 452:12248 | `PaymentView.amount_due` / Pricing `total` | OK |
| `Method: ACH Transfer` select | 452:12248 | `GET /api/payments/methods`. Write: `PATCH /api/payments/details/:id {method}`. | OK. M-10 (the DORADO_ACCOUNT branch). |
| `Pay to: Chase · Checking •••• 4417` select | 452:12248 | `GET /api/payments/payouts/pay_to?user_id=` -> `PayTo[]` (verified bank links) | OK. M-11. |
| `Send payment` (disabled on this frame) | 452:12248 | `actions[send_payment]` + `confirm`. Calls: `POST /api/payments/payouts` (open) then `POST /payouts/:id/send`. | OK. WW-10 (drawn disabled). M-4 (confirm). |
| Totals `Scrap $8,412.66`, `Bullion $4,969.93`, `Shipping $24.00`, `Payout fee $12.50`, `Total payout $13,346.09` | 152:1188 | Pricing `scrap_total`, `bullion_total`, `shipping_charge`, `payout_fee`, `total` | OK (reconciles to the cent) |
| Profit Breakdown header `4 of 5 settled` | 152:1207 | `ProfitBreakdown.settled_lots/total_lots` | WW-7 (the API counts only refiner-assayed lots) |
| `UNSETTLED` `Lot 2481-E $284.94`, `SETTLED` `Lot 2481-A…D` (links) | 152:1207 | `lots[] {lot_id, reference, value, estimated, settled_at}`. The link goes to the lot by `lot_id`. | WW-7 (D and E are bullion and are not in `lots[]`) |
| `FEES` `Shipping $24.00`, `Payout fee $12.50` | 152:1207 | `ProfitBreakdown.fees` is one number. The split is only in Pricing. | GAP (R-8) |
| `Profit $773.91` | 152:1207 | GAP: no top-level profit. `parties[]` has per-party `total_profit`, and which party the card means is not defined. | GAP (R-8) |
| Documents `5 documents` | 25:425 | `GET /:id/documents` length | OK |
| `Invoice · Not yet available` | 25:425 | `OrderDocument {kind:'invoice', available:false}` | OK |
| `Shipment Manifest · PDF · 31 KB · Sep 1, 2026` + send / download / delete icons | 25:425 | `pdf_id` OK. **No size, no date.** Send: `POST …/documents/:kind/send`. Download: `POST /api/pdf/generate_packing_list`. **Delete: no endpoint.** | GAP (size, date). WW-12 (delete). |
| `Return Shipment Manifest · Not yet available` | 25:425 | `return_packing_list` | OK |
| `Shipping Instructions · Ready to generate` + generate icon | 25:425 | `available:true, pdf_id:null`, `generate_shipping_instructions` | OK |
| `Assay Results · Not yet available` + generate icon | 25:425 | API name is **`Quote Estimate`** (`orders/rules.ts:245`) | label drift (R-13) |
| Messages: thread, `Today`, bubbles, `2:14 PM · Delivered`, chat/phone switch, attach, `Text the customer…`, send | 148:553 | `/api/sms`, `/api/calls` (customer-keyed, not order-keyed) | OK as a customer thread (api-gaps §3 Q7 is still open) |

### P2 834:21175: Ready to Pay (only the differences from P1)

| Item | Node | Source | Status |
|---|---|---|---|
| Header badge `Ready to Pay` | 1104:22839 | `state` | OK |
| `Finalize` still shown | 1104:22839 | `finalize` is not offered once `spots_locked` (Ready to Pay requires locked + total) | WW-10 |
| Lots table: scrap names `14K Gold` (P1 says `14 Karat Gold`), `142.50` formatting | 834:21183 | `name` | sample drift |
| Lot inputs still editable | 834:21183 | `edit_lots` not offered while locked | WW-10 |
| Payment `Not sent`, `Send payment` **disabled** | 834:21185 | `send_payment` is offered whenever `totals.total != null` | WW-10 |
| Profit · proposed `3 of 5 settled`. UNSETTLED D, E. SETTLED A, B, C. FEES. Profit. | 834:21188 | as P1 | WW-7, R-8. **D is "settled" on P1 and "unsettled" on P2** for the same order (sample drift). |

### P3 834:21442: mobile Profit Breakdown

| Item | Node | Source | Status |
|---|---|---|---|
| Header: eyebrow, badge `Ready to Pay`, name, `PO-2481 · Austin, TX`, `7 orders to date`, Assigned to, Cancel, Finalize | 1106:22874 | as P1 | as P1/P2 (WW-10) |
| Profit Breakdown (as P2) | 834:21469 | as P2 | as P2 |
| No other card | 834:21442 | — | M-14 (no mobile base screen) |

### P4 729:35427: Adopt refiner assay drawer (desktop, LG, right-anchored)

| Item | Node | Source | Status |
|---|---|---|---|
| Entry `Adopt refiner assay` in the Lots title row | 729:35435 (Lots · proposed 729:17246) | GAP: `adopt_assay` is not in `actionsFor`, so nothing says when the button is live | GAP (R-5) |
| Badge `At Refiner` | 1104:22771 | `state` | OK |
| Drawer title, close X | 1160:22722 | static | OK |
| Section `FROM ITS OWN LINE` / `FROM A SHARED LINE` | 1160:22722 | derived from `AdoptAssayCandidate.share` (1 vs < 1) | OK (a presentation split, not money) |
| Row name `14K Gold`, `18K Gold`, `Sterling Silver` | 1160:22722 | candidate has `product_name` (null for scrap), `metal_id`, `form`. It has **no purity-label `name` and no lot `reference`.** | GAP + WW-13 |
| `Ours 139.22 g · 58.3%` | 1160:22722 | `current.post_melt`, `current.purity` | OK. Sample drift: the Lots table says 56.3% (and 18K 72.6% vs 73.0%). |
| `Refiner 138.90 g · 58.1%` | 1160:22722 | `refiner.post_melt`, `refiner.purity` | OK |
| Inputs `138.90 g`, `58.1 %` (prefilled) | 1160:22722 | `proposed.*`. Write: `POST /:id/adopt_assay {lots:[{id, figures}]}`. | OK |
| `31% of ELM-88433` (link) | 1160:22722 | `share` OK. `inventory.lots.line_reference` exists, but `adopt_assay_proposal.sql` and `AdoptAssayCandidate` do not return it. | GAP (R-4) |
| Footer `Cancel` / `Adopt` | 1160:22722 | POST above | OK. M-6 (no `combine` choice). |
| Bullion lots D and E absent | 1160:22722 | proposal covers only batched lots | OK |

### P5 729:36280: Adopt drawer (mobile, Full)

| Item | Node | Source | Status |
|---|---|---|---|
| Title, sections, rows as P4, `Post melt` / `Purity` labels, helper `Ours: 139.22 g` / `Ours: 58.3%` | 1160:23218 | as P4 | as P4. The refiner figure has no label on mobile (it is only the prefilled value). |
| No close X | 1160:23218 | — | design defect (Full drawer, ruling of 2026-10-14) |
| Footer `Adopt` over `Cancel` | 1160:23218 | drawer ruling (Save on top) | OK |
| Background `Note` text | 729:36307 | static | OK |

### Purchase-order components not on any scope screen (state coverage)

| Item | Node | Source | Status |
|---|---|---|---|
| Spots `Unlocked` / `Locked` collapsed labels; 4 metal inputs in the main | 170:2226 | `spots_locked`, `/:id/spots` | WW-9 |
| Lots / Adding Lot: title `Items`, search `Search by lot #, metal or customer…`, results `LOT-2481-A · 14K gold scrap · 180.1 g · Whitfield`, `LOT-2477-A … Okafor`, `Add to Order` | 326:9499 | `POST /:id/lots {lot_id}` is **sale only**. A purchase adds `OrderLotPatch` (a new declared or catalogue lot). | WW-14 |
| Lots `Selection=Some`: checked rows, live combine and delete | 468:10535 | combine / delete endpoints | WW-11 |
| Payment `Processing` (button `Processing…`), `Sent` (`Payment sent`) | 266:10671, 266:10737 | `PaymentView.state` | OK |
| Payment `Due` / `Received` / `Matching` (`Request payment`, inbound match list `Sep 5 · Wire · $14,120.00 · ELEMETAL…`) | 292:5099, 292:5175, 333:9581 | sale / refiner rails | out of purchase scope |
| Payout override `Record a second payout?` / `Payout is above the order total?`, `Reason` (at least 10 characters), step-up line, Cancel / `Send payment` (danger) | 1088:22690 | `OpenPayoutBody.override_reason`, `SendPayoutBody.override_reason`, `POST /api/account/step_up` | OK. WW-15 (above total). M-8 (step-up). |
| Fulfillment Empty: `No fulfillment yet`, `Create fulfillment`, badge `Not set` | 209:2926 | `GET /:orderId/fulfillments` 404 -> `POST /api/fulfillments {order_id}` (admin) | OK |
| Fulfillment Choose Method: `Drop ship to customer`, `Ship to …` | 379:8510 | sale / refiner method | out of scope |
| Create Shipment: Service, Package size, Handoff, Ship to `Keller office`, Ship from, Declared value `50,000`, Coverage `Standard`, Additional coverage `40,000`, Carrier pickup calendar + window, `Create Shipment`, badge `Draft` | 237:4046 | `POST /api/fulfillments`, `/set_method`, `PATCH /api/fulfillments/:id` (`missing[]` steps), `GET /api/shipping/check_pickup`, `POST /api/shipments/:id/label` | OK. No rate shown (M-13). `Coverage` select has no field (`insured` is a boolean). |
| Create Pickup: Driver, Pickup address, date, Window, `Create Pickup` | 237:4275 | `POST /api/fulfillments/schedule_pickup` | OK |
| Create Appointment: Office, With, date, Time, `Create Appointment` | 237:4447 | `POST /api/fulfillments/schedule_direct` | OK |
| Create Return: Service, Package, Handoff, Ship to, Ship from, Declared value, Coverage, Additional coverage, pickup date/window, toggle `Bill return shipping to the customer $24.00`, `Create Return` | 296:5602 | Return exists only inside `POST /:id/cancel {carrier_service_id, package_id, bill_return_to_customer}`. **No declared value, coverage, pickup or ship-from input. No return without cancel. No rate read for `$24.00`.** | WW-16 |
| Create Drop-off (Driver, Refinery, date) | 319:6160 | DROPOFF is our driver to a refiner (refiner order) | out of scope (the tab label reads `Pickup`, a design defect) |
| Shipment Label Created: Tracking, Carrier `FedEx Ground`, `Label created`, `Ships from Austin, TX`, `Cancel Shipment`, `Print Label` | 181:2530 | `ShipmentView`, `POST /api/shipping/cancel_label`, label bytes in `OrderView.shipments[].label` | OK |
| Shipment In Transit: `ETA Sep 3, by 8:00 PM`, timeline with Pending stages | 179:2346 | `est_delivery`, `timeline[].reached` | OK |
| Shipment Awaiting Tracking (drop ship, `Save Tracking`) | 374:8422 | `POST /api/shipments/:id/tracking` | out of purchase scope |
| Return Shipment Label Created / In Transit / Returned, `Cancel Return`, `Print Label` | 296:5034, 296:5061, 296:5071 | Return-direction shipment + `cancel_label` | OK. Cancelling the return label leaves the order Cancelled (M-5). |
| Pickup Scheduled (`Cancel Pickup`, `Reschedule`, `Headed to Pickup`), In Transit (`Mark Picked Up`), Picked Up (`Items are in-house. Finalize pricing.`) | 184:2708, 194:2916, 184:2780 | `cancel_schedule`, `schedule_pickup`, `set_status` (`transitions`, `moves[].confirm`) | OK |
| Appointment Scheduled (`Check In`), In Progress (`Mark Complete`), Completed | 184:2564, 194:3018, 184:2640 | DIRECT `SCHEDULED/IN_PROGRESS/COMPLETED` via `set_status` | OK |
| Drop-off `Received by R. Alvarez · dock 3` | 319:5814 | no field | out of scope (refiner) |

---

## 3. WON'T WORK AS DRAWN

| # | Node | What | Why |
|---|---|---|---|
| WW-1 | 620:5115 vs 673:20375 | The base `Orders` page keeps the **old** list card (two badges, `N unassigned · $total`). The proposal is only on the porting page. | Ruling 112: a status is derived, one per order. The old badges are payout state + shipping state, which the list does not carry and should not. Jacob must name L2 as the port target. |
| WW-2 | 620:5115, 634:12204 | `Showing: Customers / Refiners` puts refiner orders on the customer list as `PO-2495`, with "unassigned lots" and "Received". | Ruling 125: refiner orders are `RP-`/`RS-`. They are another resource (`/api/refining/orders`) with another state machine (`refining_state.sql`). L2 already drops the toggle. Keep it dropped. |
| WW-3 | 673:20394, 620:5758, 917:13509 | Selection bar sums `$15,532.70 est.` and fine oz per metal across selected orders. | Money rule (ruling 75): the frontend computes no money. Summing `estimated_value` is client arithmetic. Fine-oz totals are also derived. Needs a server read (R-3). |
| WW-4 | 673:20393 (PO-2465), 673:20390 (PO-2492) | Cards badged `Awaiting Receipt` print `Received Sep 2`. | `Awaiting Receipt` means `arrived_at IS NULL`. The footer must switch to `Placed {placed_at}` when `arrived_at` is null. |
| WW-5 | 671:28777, 917:13214 | Mobile card draws 5 lot rows **plus** `+3 more` over `5 lots`. | `list.sql` returns 3 lots and `more_count = lot_count − 3`. Draw 3 rows, or raise the cap for both layouts. Five rows plus three more is eight, not five. |
| WW-6 | 673:20385, 620:5789, 634:13082, 619:4639 | `Show` select carries `Unassigned` / `Open` / `Completed` / `Orders with unassigned lots`. Two of these duplicate the state chips. | One filter, one meaning. `Completed` and `Open` are `state` values (chips). Only `has_unassigned_lots` is a different axis. Make `Show` a two-value control (All / With unassigned lots), or fold it into the chips. |
| WW-7 | 152:1207, 834:21188, 834:21469, 833:21320 | Profit Breakdown lists **all five** lots, including bullion D and E, with `N of 5 settled`. | `profit_breakdown.sql` (`lot_status`, `lot_values`) lists and counts only refiner-batched lots. A bullion lot has no `batch` edge and is absent. The coordinator ruled "keep all lots" (comments log §2.11/Q4). The API was not changed (R-7). |
| WW-8 | 619:4750 | Context menu reads `Edit details`, `Edit details`, `Delete address`. | Placeholder. An order is never deleted. It is cancelled (`POST /:id/cancel`) and reopened (`PATCH {cancelled_at:null}`). The menu must list `actions[]` names. |
| WW-9 | 152:837, 170:2226 | Spots inputs are editable on `Unlocked`, and the main draws all four metals. | `PUT /:id/spots {set}` writes a frozen bid. Unlocked pricing reads the live feed, and the next lock overwrites the edit (`set_bids_from_feed.sql`). Inputs must be read-only while unlocked. Also the ruling of 2026-10-14 says a lock covers only the order's metals, while the API locks every `orders.spots` row (R-1). |
| WW-10 | 834:21175, 1104:22839, 834:21183, 834:21185, 834:21442 | `Ready to Pay` shows `Finalize`, live lot inputs, and a **disabled** `Send payment`. | `actionsFor`: `finalize` and `edit_lots` need `!spots_locked`. `send_payment` is offered when `totals.total != null`. Ready to Pay means locked + total, so the frame inverts all three. Every button must render from `actions[]`. Also, placement locks spots (`place.ts`), so `Finalize` on a fresh order (P1) appears only after an unlock. Confirm this flow with Jacob (Q-1). |
| WW-11 | 152:882, 468:10535 | Lots delete (trash) runs on the selection with no confirm. | `DELETE /api/orders/lots/:id` deletes the link **and the lot**. A customer's declared lot is an irreplaceable record (CLAUDE.md: scrap declarations cannot be recreated). Draw a confirm at least. Better: make removal a fact (R-10). |
| WW-12 | 25:425 | Document row trash icon. | No endpoint deletes a stored PDF, and a sent document is a record. Drop the icon, or rule on it. |
| WW-13 | 1160:22722, 1160:23218 | Adopt rows show only `14K Gold` / `Sterling Silver`. | Jacob, 2026-09-22: a derived scrap name is not an identifier, and the lot number must show beside it. Two lots can both read `14K Gold`. Add `Lot 2481-A` (the read lacks `reference`, R-4). |
| WW-14 | 326:9499 | Adding a lot searches existing lots across customers and `Add to Order`. | On a purchase, `POST /:id/lots` with `{lot_id}` is refused. Assigning a stock lot is sale only (lot model: a purchase mints its lots). A purchase adds a new declared or catalogue lot (`OrderLotPatch`). Redraw as a new-lot row (metal, weight, purity, or a catalogue product). |
| WW-15 | 1088:22628, 1088:22659 | `Payout is above the order total?` override. | The Payment card has no amount input, so a payout can never exceed the total from this screen. `OpenPayoutBody.amount` exists. Either add an amount field, or drop the variant. |
| WW-16 | 296:5602 | `Create Return` as a free-standing fulfillment with coverage, declared value, ship-from and a pickup window. | A return exists only through `POST /:id/cancel`. That call computes the declared value and takes only `carrier_service_id`, `package_id`, `bill_return_to_customer`. There is no partial return and no return without cancel. Either the card becomes the cancel dialog's body, or the API grows a return endpoint (Q-3). |

---

## 4. MISSING FROM THE DESIGN

| # | Where | Missing | Why it is needed |
|---|---|---|---|
| M-1 | 168:2022 / 1108:22878 | State badge on the base purchase screen | Every order has a derived `state`. The base screen is the port reference. |
| M-2 | L2, L3 | List empty state (no orders match, no orders at all) | Filters plus chips can return zero rows. `counts.orders = 0`. |
| M-3 | L2, L3 | Pagination / load more | List pages by `limit`/`offset` (default 50). `counts.orders` gives the total. Nothing drawn. |
| M-4 | P1 | Plain confirm dialogs for confirm-class actions: `finalize` (`n of N lots are not confirmed`, `…have no fine weight`), `send_payment` (`Refiner has not settled n of N lots`, `not finalized`), `assign_lots`, `refining_sale` | Ruling 112: confirm-class actions keep a plain confirm. The reason string comes from `actions[].confirm`. Only the two override dialogs are drawn. |
| M-5 | P1 | Cancel confirm with return options (service, package, bill return to customer), and the `Cancelled` purchase frame with `reopen` | Cancel buys a FedEx return label after commit (irreversible). `OrderCancelBody` takes those three choices. No Cancelled screen exists. |
| M-6 | P4, P5 | `combine` choice (or a statement of it) on Adopt | `POST adopt_assay` combines lots that share a refiner line unless `combine:false`. That rewrites the order's lot links, which is a large silent effect. |
| M-7 | Lots 170:2260 | Per-lot confirm control and indicator (`confirmed_at`), declared vs measured variance (`declared_*`), split | `finalizeConfirm` counts unconfirmed lots, but no control sets `confirmed_at`. The declared columns exist so the variance can be shown (facts-and-positions §1). `POST /orders/lots/:id/split` has no entry point. |
| M-8 | 1088:22690 | Step-up flow (re-authenticate) | An override needs a step-up within 5 minutes (`POST /api/account/step_up`). The dialog says so but no step is drawn. |
| M-9 | Payment 170:2316 | `Failed` state with `failure_reason`, and retry | `TransferState` has `Failed`. Moov failures land there. A retry needs the override. |
| M-10 | Payment 170:2316 | `DORADO_ACCOUNT` (credit to balance) branch: `Add funds` button, credited state | `add_funds` is a separate action with its own override (`already been credited`). |
| M-11 | Payment 170:2316 | No-verified-bank-link state | `send` needs a verified `bank_link` with a Moov `payment_method_id`. `pay_to` can be empty. |
| M-12 | L2 chips, 715:38985 | `Cancelled` chip or filter | `Cancelled` is a reachable purchase state. A cancelled order is otherwise invisible except under `All`. |
| M-13 | 237:4046, 296:5602 | Rate / cost read before `Create Shipment` / `Create Return` | Buying a label spends money. `GET /api/fulfillments/:id/rates` exists. The `$24.00` on the return toggle has no drawn source. |
| M-14 | mobile | A mobile base purchase screen (Shipment, Spots, Lots, Charges, Payment, Totals, Documents, Messages) | Only two mobile state screens exist (header + profit, drawer). Mobile card variants exist but no screen composes them. |
| M-15 | L2 | Desktop `New order` (mobile has it) | `POST /api/orders/admin` exists. One label on both layouts. |
| M-16 | P1 Spots | Stale-feed and lock-time display (`spots[].state`, `last_tick_at`, `spots_at`), and the `unpriceable[]` state | An unlocked order prices off the live feed. A stale or never-quoted metal must show as such (ruling 112 blocked class, FOLLOWUPS pricing leftovers). |
| M-17 | P1 Lots | Empty lots state, with `finalize` blocked (`the order holds no lots`) | It is a blocked reason the API already returns. |
| M-18 | all | Loading and error states for every card read (the view is split over about 8 calls) | `OrderView` does not include spots, documents, fulfillment, transfer or tracking. Each card loads and fails on its own. |
| M-19 | scope | Any **customer-facing** purchase-order screen (the customer's own view) | Customers read `/api/orders/:id`, `/documents`, `/shipments`, `/payment-details`. None is designed. Note: `actions[]` is not role-filtered (R-11). |
| M-20 | P1 Documents | Upload (`POST …/documents/:kind`) and the per-fulfillment document sets (Pickup Manifest, Intake Receipt, Appointment Instructions) | `documentsFor` changes the rows by fulfillment category. Only the SHIPMENT set is drawn. |
| M-21 | P1 | Order `notes` (one text column, admin) | `OrderPatch.notes` exists and nothing shows it. |

---

## 5. Prior items in `api-gaps-orders.md` (2026-10-09) that touch this scope

| Item | Status | Evidence |
|---|---|---|
| §1.1 state chips filter | **closed** | `?state=` repeatable, `controller.ts:46-71`. Validated against `OrderState`. |
| §1.2 Assigned to filter | **closed** | `?assigned_to_id=<uuid>\|unassigned` |
| §1.3 has unassigned lots | **closed** | `?has_unassigned_lots=true` (not admin-gated; harmless) |
| §1.4 sort | **closed** | `orders.list_sorts` (migration 260), `GET /api/orders/sorts`, `?sort=` |
| §1.5 counts | **closed** | `OrderList.counts {orders, unassigned_lots}` over the whole filter |
| §1.6 lots on the card | **closed, with two gaps** | `lots` (3), `more_count`, prefixed `destination`. Still missing: `name`, `quantity`, `image_id` (R-2). |
| §1.7 lot count + estimate | **closed** | `lot_count`, `estimated_value` from `db/pricing/sql/order_value.sql` |
| §1.8 Received date | **closed** | `arrived_at` from `fulfillments.arrivals` (migration 261) |
| §1.9 search | **closed (prefix only)** | `GET /api/search` (`orders/search/routes.ts:8`). Infix waits on `pg_trgm`. |
| §1.10 `New lot` button | **superseded** | Desktop header no longer draws it. Mobile `New order` maps to `POST /api/orders/admin`. |
| §1.11 Order State 14 values | **closed** | `OrderState` has 14 values. Draft badge has no label (design defect). |
| §1.12 Draft | **closed (refiner only)** | `refining_state.sql:17` `WHEN ro.sent_at IS NULL THEN 'Draft'`. No customer Draft (as recommended). |
| §1.13 adopt row name | **partly closed** | `product_name`, `metal_id`, `form` added. Still no purity-label `name` and no lot `reference` (WW-13). |
| §1.14 `31% of ELM-88433` | **partly closed** | Column `inventory.lots.line_reference` exists and `settle.sql` writes it. The adopt proposal does not return it (R-4). |
| §1.16 payout | **closed** | `ProfitBreakdown.payout`. The design then removed the PAID row (comments log, 1966634637). |
| §1.17 per-lot rows | **closed, scope wrong** | `lots[] {lot_id, reference, settled_at, settled_spot, value, estimated}`. Bullion lots are excluded (WW-7). |
| §1.18 fees | **closed as one number, reopened by design** | `fees` exists. The design now splits Shipping / Payout fee (R-8). |
| §1.19 `3 of 4 settled` | **superseded** | Q4 ruled "all lots". The API still counts only refiner-assayed lots (WW-7). |
| §1.26 `Arrived` stage | **closed** | `TRACKING_STAGES` = Picked Up, Arrived, In Transit, Out for Delivery, Delivered (`logistics/shipping/rules.ts:241`) |
| §2.10 confirm / override never drawn | **partly closed** | Payout override 1088:22690 is drawn. Confirm dialogs (M-4) and step-up (M-8) are not. |
| §2.11 / §2.12 profit denominator and arithmetic | **design closed, API open** | Rows reconcile in Figma. API scope differs (WW-7). |
| §2.13 two profit cards | **closed** | Jacob's 170:2373 now carries the proposed body. 168:2022 shows it. |
| §2.15 documents labels | **closed in design, drift remains** | `Shipment Manifest` / `Return Shipment Manifest` match. `Assay Results` vs the API's `Quote Estimate` (R-13). |
| §2.16 batch select label / `order_ids` | **closed on desktop and API, open on mobile** | `RefiningBatch.order_ids` exists. Mobile 955:15753 still reads `Send to`. |
| §3 Q4 profit lots | **ruled, not built** | Coordinator: keep all lots. `profit_breakdown.sql` unchanged. |
| §3 Q7 messages per order | **still open** | `crm.sms_messages` / `crm.calls` stay customer-keyed. The card does not say so. |
| §3 Q8 search | **closed** | One endpoint, flat rows (as recommended) |
| §3 Q9 New lot | **superseded** | as §1.10 |
| §3 Q12 chip counts | **closed** | No per-chip counts drawn. One count line. |
| "also noted": the old list card on 620:5115 | **still open** | It is still the base screen (WW-1) |

---

## 6. API changes the port needs (ranked; smallest honest change each)

| Rank | Change | Why | Size |
|---|---|---|---|
| R-1 | Spot locks only for the order's metals: create `orders.spots` rows only for the metals the order's lots hold, record lock events per metal, give a metal added later (lot add/edit, refiner assay) its own lock event from that step with a reason, and refuse a money read for a metal with no lock (blocked class). Add a read of `orders.spot_locks` events. | Ruling 2026-10-14 (FOLLOWUPS "Orders: spot locks only…"). Today `set_bids_from_feed.sql` locks every row. The Spots card already hides unused metals. | M |
| R-2 | `list.sql` lot rows: add `name` (the same `COALESCE` as `view.sql:42`), `quantity`, `image_id`. | Card rows print `14K Gold`, `Qty 3`, and a thumbnail. | S |
| R-3 | A selection summary read, priced by pricing: `GET /api/orders/summary?id=…` (or `POST` with `order_ids`) returning `{orders, lot_count, estimated_value, fine_oz:[{metal_id, content}]}`. | WW-3, money rule. | S |
| R-4 | Adopt proposal: add `reference` (`Lot 2481-A`), `name` (purity label) and the refiner lot's `line_reference` to `AdoptAssayCandidate` and `adopt_assay_proposal.sql`. | WW-13, §1.13/§1.14. | S |
| R-5 | Add `adopt_assay` to `orders/rules.ts actionsFor` (offered when an order lot's refiner lot has an assay), with a confirm when `combine` would merge lots. | The Lots-card button needs a gate. M-6. | S |
| R-6 | `completed_at` on the list item and `OrderView`: the completing fact's time (payout transfer `completed_at`/`sent_at`, or the credit ledger row's `created_at`), in the same fragment family as `order_state.sql`. | L6 footer `Completed Aug 26`. Sort by completion is also implied. | S |
| R-7 | `profit_breakdown.sql`: list and count every order lot. A bullion lot is valued on its confirmation, and it is `estimated` until it is sold (`sale` edge) or confirmed, as ruled in Q4. | WW-7. The coordinator ruled it on the design side only. | M |
| R-8 | `ProfitBreakdown`: add `profit` (the number the card prints, with its party named) and split `fees` into `shipping` and `payout_fee`. | No client arithmetic (ruling 75). The card prints three figures that the read does not return. | S |
| R-9 | `payment_view.sql`: stop filtering `state <> 'Failed'`. Return the latest transfer, including Failed with `failure_reason`. | M-9. A failed payout is invisible today. | S |
| R-10 | Removing a lot from a purchase: decide between "unlink and keep the lot" and a `removed_at` fact, instead of deleting `inventory.lots`. Until then, the UI confirm is mandatory. | WW-11. The do-not-lose-data rule. | M (needs Jacob) |
| R-11 | Role-filter `actions[]` in `orderViewForCustomer` (customers get none, or only customer actions). Drop `shipments[].label` from the customer copy unless the inbound label is meant for them. | Admin action names reach customers today. | S |
| R-12 | `POST /api/shipments/:id/charge` and `/actual_cost` become `PATCH /api/shipments/:id` fields. Guard `PUT /:id/spots {set}` so it refuses (or confirms) while unlocked or after finalize. | Ruling 114 (a column edit with no side effect is a PATCH). WW-9. | S |
| R-13 | Pick one name for `assay_results`: the design says `Assay Results`, the API says `Quote Estimate`. Add `size` and `created_at` to `OrderDocument` from `media.pdfs`. | Documents row text `PDF · 31 KB · Sep 1, 2026`. | S |
| R-14 | `RefiningBatch.location_id` (optional) | `Batch into: Elemetal · Dallas` names a location. | S |
| R-15 | Return leg outside cancel, **only if Jacob wants** the Create Return card as drawn (Q-3). Otherwise none. | WW-16 | M / none |

Questions for Jacob:

- **Q-1.** Placement locks spots, so `Finalize` and lot edits need an unlock first. Is that the intended flow, or should placement stop locking now that lock-on-demand is the ruling?
- **Q-2.** Port target for the list: L2 673:20375 (proposed) or L1 620:5115 (base)?
- **Q-3.** Is a return a separate fulfillment (a partial return without cancel), or always the cancel path?
- **Q-4.** Lot removal on a purchase: unlink, or a fact?

---

## 7. Counts

| Measure | Count |
|---|---|
| Screens in scope | 11 (6 list, 5 purchase: 3 desktop, 2 mobile) |
| Components read | 30 component sets / mains |
| Facts, controls and states inventoried (table rows in §1-2) | 136 |
| Rows whose status starts with OK (some carry a WW or M note) | 84 |
| Rows with a GAP status (API missing a field, filter or endpoint) | 15 |
| Rows out of purchase scope (sale or refiner) | 6 |
| WON'T WORK AS DRAWN | 16 |
| MISSING FROM THE DESIGN | 21 |
| Prior api-gaps items in scope | 30: 15 closed, 9 partly closed or closed with gaps, 3 superseded, 3 ruled or open on Jacob |
| Ranked API changes | 15 (11 S, 4 M), plus 4 questions |
