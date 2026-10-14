# Customer sales order (SO-1112): design against the API

Review before the Orders code port. File `ymmNlCDLVIfanpRQ7QHMIs`, read live 2026-10-14. API read on the `orders-review` worktree (dev copy). Nothing was run against a database.

Method: `get_metadata` and `get_screenshot` on every node below; `get_design_context` on the base and each card set. The `figma-design-to-code` skill is not installed in this session (`Skill` reports "Unknown skill"), so it was not loaded. The context calls were used to read text and node ids only, and no code was generated from them. Hidden nodes are left out: Profit Breakdown `358:4906` is hidden on the base.

Instance ids on the base start with `I<instance>;`. Below, `;x` is short for the full id under that row's instance.

---

## 0. The screen

Base `358:4893` "Sales Order (Admin)", desktop 1440. Main column: Fulfillment `382:4563` (Shipment, In Transit), Spots `358:4900` (Locked), Lots `482:12326` (Bullion), Charges `358:4902`, Payment `452:12424` (State=Matching). Aside: Totals `358:4905`, Documents `358:4907`, Chat `358:4908`. Header `1108:22977` (Order Header, no badge). The app bar `358:4894` is the storefront header.

**No mobile base.** The file has no mobile sales-order screen. The 8 mobile state screens are all purchase or refiner orders. §6 lists what the mobile port must infer.

---

## 1–2. Inventory, and what supplies each fact

Legend: **B** = backed (source named). **P** = partly backed. **GAP** = missing (what is missing). Reads: `GET /api/orders/:id` = `OrderView` (`db/orders/sql/view.sql` + `orders/rules.ts actionsFor`). Money: `POST /api/pricing/order` = `OrderPricing` (`db/pricing/sql/order_pricing.sql`). Payment: `GET /api/payments/view/:orderId` = `PaymentView` (`db/payments/transfers/sql/payment_view.sql`).

### 1.1 App bar and Entity Header `1108:22977`

| # | Drawn | Node | Source | Status |
|---|---|---|---|---|
| H1 | Storefront nav `How it works · Pricing · About · Contact`, avatar `JD` | `358:4894`, `I1148:25124…25127;26:397` | app shell | WON'T WORK: the admin screen wears the public header (W12) |
| H2 | Eyebrow `SALES ORDER` | `;848:6;74:95` | `OrderView.order.direction` | B |
| H3 | Title `Marguerite Whitfield` | `1108:22977` Text (H2) | `OrderView.user` (`OrderViewUser`) | B |
| H4 | `SO-1112 · Austin, TX` | `;848:15;74:71` | `OrderView.reference` (`order_reference.sql`) + `OrderView.address.city` | B |
| H5 | `8 orders to date` | `;848:17;74:71` | `OrderView.user.orders_to_date` | B |
| H6 | `Assigned to` Select `Dana Whitlock` | `;848:20` | `PATCH /api/orders/:id` `OrderPatch.assigned_to_id`; options `GET /api/employees` | B |
| H7 | `Cancel` (Secondary/Danger) | `;848:28` | `POST /api/orders/:id/cancel` | GAP: `orders/service.ts:254` refuses with `assertDirection(…,'purchase','cancelling')`. `actionsFor` offers `cancel` only to purchases (`rules.ts:186`). `PATCH cancelled_at` only clears a cancel (`assertClearsCancellation`). No admin path cancels a sale (W2) |
| H8 | `Finalize` (Primary) | `;848:33` | `POST /api/orders/:id/finalize` | WON'T WORK: `finalizeBlockedBy` blocks every non-purchase (`rules.ts:131`); never offered on a sale (W1) |
| H9 | State badge | not drawn on base (hidden); proposal `Order State` `664:12789` | `OrderView.state` (`order_state.sql`: `Awaiting Payment → Preparing → In Transit → Completed`, `Cancelled`) | B. The base shows no badge. The drawn facts (charge `Due`, parcel in transit) derive `Awaiting Payment`, not `In Transit` (W9) |
| H10 | Edit row | not on base; drawn only on refiner/mobile headers | `OrderPatch` = `notes`, `assigned_to_id`, `cancelled_at`, `review_created` | B for what a sale can edit; nothing else on a sale is header-editable |

### 1.2 Fulfillment slot: Shipment `382:4563` (set `179:2460`, variant In Transit `179:2346`)

| # | Drawn | Node | Source | Status |
|---|---|---|---|---|
| F1 | Title `Shipment`, badge `In Transit` | `;179:2347`, `;180:2524;32:78` | `OrderView.shipments[].shipping_status` (`shipping.shipments`) | B |
| F2 | `Tracking # 7948 1234 5678` | `;179:2364;597:63` | `shipments[].tracking_number` | B |
| F3 | `ETA Sep 3, by 8:00 PM` | `;179:2364;597:66` | `shipments[].est_delivery` | B |
| F4 | Tracker `Picked Up · Dallas · Sep 1` | `;597:74`, `;642:72`, `;597:75` | `POST /api/shipping/get_tracking` → `trackingTimeline` (`logistics/shipping/rules.ts`) | B |
| F5 | `Arrived · Dallas · Sep 2` | `;597:82` | `TRACKING_STAGES` includes `Arrived`; FedEx `AR → 'Arrived'` (`providers/fedex/constants.ts:63`) | B (was gap #26) |
| F6 | `In Transit · Fort Worth`, `Out for Delivery · Pending · —`, `Delivered · Pending · —` | `;597:90`, `;597:98`, `;597:106` | same timeline; unreached stages are `Pending` | B |
| F7 | Insurance / declared value on the outbound parcel | not drawn on the card | `shipments[].insured`, `declared_value`, `additional_coverage` | GAP (data): `labels.ts:47` seals a SALE parcel with `declaredValue(0)`, so every outbound sale ships `insured=false`, `declared_value=null` (W5) |
| F8 | Signature on delivery | not drawn | none: no column, no FedEx `signatureOption` in `providers/fedex` | GAP: no fact, no write, no label option (M9) |
| F9 | Ship-to address | not on this card (only on Label Created `374:8433`) | `GET /api/orders/:id/address` (snapshot) | B for read. GAP for change after label (M8) |

Shipment set variants (each also has an `Open=False` twin):

| # | Variant | Node | Controls / facts | Source | Status |
|---|---|---|---|---|---|
| F10 | Label Created | `181:2530` | `Carrier FedEx Ground`, `Label created Sep 1`, `Ships from` / `Ships to 412 Oak Hollow Dr` (`362:10786…374:8434`), `Print Label` `I181:2613`, `Cancel Shipment` `I181:2618` | `shipments[].label`, `service_name`, `created_at`; `POST /api/shipping/cancel_label` | B. `Print Label` uses the stored `label` (base64); there is no download route, so the client decodes it |
| F11 | Awaiting Tracking | `374:8422` | `Carrier` select `FedEx`, `Paste the refiner's tracking number` `I374:8480`, `Save Tracking` `I374:8493`, note `374:8442` (drop ship) | `POST /api/shipments/:id/tracking` (`update_tracking` action); `POST /api/orders/:id/supply` makes the RP order | B. This is the refiner drop-ship variant; on a sale it is the only backorder trace in the file (M5) |
| F12 | Delivered | `194:2710` | Tracker all reached | `shipments[].delivered_at` | B |

Fulfillment slot `209:3010`: Empty `209:2926` (empty state + create entry), Choose Method `379:8510`. Source: `GET /api/orders/:orderId/fulfillments`, methods `GET /api/fulfillments/methods` (methods carry `direction`). **B.**

Create Fulfillment `237:4619` (header `Fulfillment` + `Draft` badge + tabs `Shipment · Pickup · Appointment`, `1148:24439`):

| # | Variant / control | Node | Source | Status |
|---|---|---|---|---|
| C1 | Shipment: `Service FedEx Express Saver`, `Package size Medium` | `237:4046`, `I237:4470` | `PATCH /api/fulfillments/:id` (`FulfillmentPatchBody`), `GET /api/shipping/services/offered`, `GET /api/shipping/packages` | B |
| C2 | `Handoff Carrier Pickup` / `Driver` + date picker `June 2026` + `Time 10:30 AM` | `237:4046`, `I1148:24438` | `GET /api/shipping/handoffs`, `pickup_date`/`pickup_time` | B |
| C3 | `Ship to`, `Ship from` | `237:4046` | recipient = order address snapshot; shipper = `places.locations` | B for create |
| C4 | `Declared value 50,000 $`, `Coverage Standard`, `Additional coverage 40,000` | `237:4046` | `shipments.declared_value`, `insured`, `additional_coverage`; the server computes the value at label time (ruling 58) | WON'T WORK as an input: ruling 58 makes the parcel value the server's. GAP as a read: a sale gets 0 (W5). `ShipmentPatch` takes only `carrier_service_id` |
| C5 | `Create Shipment` | `I237:4270` | `POST /api/fulfillments` then `POST /api/shipments/:id/label` (`buyLabel`) | B |
| C6 | Pickup: `Pickup address 412 Oak Hollow Dr…`, `Create Pickup` | `237:4275`, `I237:4326`, `I237:4443` | `POST /api/fulfillments/pickups/schedule_pickup` (admin), carrier collects FROM the address | WON'T WORK on a sale: a carrier pickup collects from the customer, which is the purchase direction (W10) |
| C7 | Appointment: `Office Keller office`, `With Dana Whitlock`, `Create Appointment` | `237:4447`, `I237:4492`, `I237:4498`, `I237:4615` | `POST …/directs/schedule_direct`; category `DIRECT` | B: the in-office handover a sale can use |
| C8 | Return Shipment: `Bill return shipping to the customer $24.00`, `Create Return` | `296:5602`, `297:2844`, `297:2845`, `I296:5623` | `OrderCancelBody.bill_return_to_customer`, `buyReturnLabel` | WON'T WORK on a sale: return leg exists only in purchase `cancel` (W10) |
| C9 | Drop-off: `Refinery Elemetal · 1200 Regal Row`, `Create Drop-off` | `319:6160`, `I319:6170`, `I319:6172` | category `DROPOFF` | WON'T WORK on a sale: goes to a refinery (W10) |

Pickup `184:2846` (Scheduled `184:2708`, In Transit `194:2916`, Picked Up `184:2780`), Appointment `195:2924` (Scheduled `184:2564`, In Progress `194:3018`, Completed `184:2640`), Drop-off `319:5963` (Scheduled `319:5760`, In Transit `319:5788`, Dropped Off `319:5814`). Source: `fulfillments.fulfillments.status` (`SCHEDULED`, `IN_TRANSIT`, `PICKED_UP`, `IN_PROGRESS`, `COMPLETED`, `DROPPED_OFF`), `POST /api/fulfillments/set_status`, `cancel_schedule`. **B.** For a sale only Appointment applies. `order_state.sql` counts `PICKED_UP`/`COMPLETED`/`DROPPED_OFF` as `Completed`.

### 1.3 Spots `358:4900` (set `170:2226`)

| # | Drawn | Node | Source | Status |
|---|---|---|---|---|
| S1 | `Gold 2,411.2 $`, `Silver 29.14 $`, `Platinum 1,022.75 $` (order's metals only) | `;269:9024`, `;269:9025`, `;269:9026` | `GET /api/orders/:id/spots` (`orders.spots` `ask`/`bid`); `OrderPricing.spots[]` lists the order's metals only | P: the card shows one number. A sale prices on `ask`, so the port must bind `ask`, not `bid` |
| S2 | Locked state, fields editable | variant Locked `269:9018` | `PUT /api/orders/:id/spots` | WON'T WORK: PUT refuses sales (`spots/service.ts:15`) and edits `bid` only. A placed sale has a charged total, so editing its spot changes nothing that was charged (W3) |
| S3 | `Unlock Spots` icon button | `;495:6577` | `actionsFor` `unlock_spots` | WON'T WORK: offered to a sale when `spots_locked` and the PUT then 400s (W3) |
| S4 | Unlocked variant `Lock Spots` | `269:8922`, `495:6572` | `actionsFor` `lock_spots` | WON'T WORK on a sale for the same reason (W3) |
| S5 | Sale spot is frozen at placement | implied by Locked | `place.ts` calls `freezeForOrder` (writes `orders.spots`) but never sets `orders.orders.spots_locked` and records no `orders.spot_locks` event | GAP / defect: every placed sale reads `spots_locked=false`, so `view.sql:91` and `order_pricing.sql` price its lot lines at the LIVE ask (W4) |

### 1.4 Lots `482:12326` (set `170:2260`, Kind=Bullion; row `152:548` Type=Bullion `152:475`)

| # | Drawn | Node | Source | Status |
|---|---|---|---|---|
| L1 | Title `Lots` | `;482:11113;32:23` | — | B |
| L2 | `+` New | `;489:4582` | `POST /api/orders/:id/lots` `OrderLotPatch` → `addLot` | GAP: `addLot` refuses any non-purchase (`service.ts:79`). Only `{lot_id}` (assign stock) works on a sale. A new line on a charged sale also needs a re-quote and a new charge (W6) |
| L3 | Batch (boxes) | `;489:4586` | `POST /api/refining/orders/batch` | WON'T WORK: a sale lot is minted with a `sale` edge, is never `on hand`, and batching is a purchase-side refiner move (W7) |
| L4 | Delete (trash) | `;489:4590` | `DELETE /api/orders/lots/:id` → `removeLot` | P: deletes the minted sale lot (the `sale` edge cascades, so the stock lot is on hand again). But `orders.transactions.items` and the charge are left as they were, and no refund exists (W6) |
| L5 | Row selection checkboxes (head + 4 rows) | screenshot; variant Selection=Some `482:11540` | client state | B (UI only) |
| L6 | Columns `Item · Qty · Premium · Price` | `;482:11122`, `;482:11123`, `;482:11127`, `;497:11019` | — | B |
| L7 | Item name `1 oz Gold American Eagle` | `;482:11129;467:10230` | `lots[].lot.product_name` (`view.sql` `b.name`) | B |
| L8 | `Lot 1112-A` | `;482:11129;487:10615` | `lots[].lot.reference` | B |
| L9 | Qty input `2` | `;482:11129;152:470` | `lots[].lot.quantity`; `PATCH /api/orders/lots/:id` | P: the read is backed. The write has no direction or charged-state guard, so it reprices a charged sale's line while `items` stays stored (W6) |
| L10 | Premium input `104 %` | `;482:11129;152:474` | `lots[].lot.premium` (ask premium frozen on the lot); PATCH as L9 | P: as L9 |
| L11 | Price `$9,403.68` | `;482:11129;152:469` | `lots[].line_total` (`view.sql`) | P: backed, but on the live ask (S5). WON'T WORK as drawn: the figures do not follow their inputs (W8) |
| L12 | Rows B–D: `1 oz Gold Maple Leaf · Lot 1112-B · 10 · 103% · $4,612.40`; `10 oz Silver Bar · 1112-C · 2 · 108% · $3,552.77`; `1 oz Platinum Eagle · 1112-D · 10 · 106% · $1,105.20` | `;482:11131`, `;482:11133`, `;482:11135` | as L7–L11 | as L7–L11 |
| L13 | Where each line is sourced from (stock lot, pool lock, refiner RP-) | not drawn | `lots[].lot.source` (`inventory`/`refiner`/`pool`) | GAP: no source reference. `refining_order_number` follows only `batch` edges, so a sale line supplied by `POST /orders/:id/supply` returns null, and the stock lot behind a `sale` edge is not named (M4) |

### 1.5 Charges `358:4902` (set `170:2277`)

| # | Drawn | Node | Source | Status |
|---|---|---|---|---|
| G1 | `Payment Charge 0.00 $` (instance label; main reads `Payout Charge` `37:1179`) | `;37:1179` | `orders.transactions.surcharge` → `OrderPricing.card_fee`; label `payments.methods.surcharge_label` | P: read is backed. Drawn as an INPUT, but no write exists: `surcharge` is not in `OrderTotalsWrite`, and it is a fact charged at placement (W11) |
| G2 | `Shipping Charge 24.00 $` | `;37:1162` | `OrderPricing.shipping_charge` (sale: `orders.transactions.shipping`); write `POST /api/shipments/:id/charge` | P: the write exists, but it changes a charged total with no confirm or override and no new charge (W6) |
| G3 | Pool Oz Remediated | `331:5796` (hidden on a sale) | — | B (refiner-only, correctly hidden) |

### 1.6 Payment `452:12424` (set `170:2316`, 11 variants; instance State=Matching `333:9581`)

| # | Drawn | Node | Source | Status |
|---|---|---|---|---|
| P1 | Badge `Due` | `;333:9584;32:69` | `PaymentView.state` (`payments.transfer_state`) | B for a wire/ACH charge |
| P2 | `Account name Dorado Metals` · `Bank Truist` · `Account type Business checking` · `Routing •••• 0442` · `Account •••• 8813` | `;333:9589`, `;333:9592`, `;333:9595`, `;333:9598`, `;333:9601` | none. `PaymentView.pay_to` / `payout_account` are the COUNTERPARTY's accounts | GAP: there is no stored fact for OUR receiving account (account name, bank, type, routing last-4, account last-4) |
| P3 | `Amount $18,674.05` | `;333:9604` | `PaymentView.amount_due` (= `orders.transactions.post_charges_amount` on a sale) | B. Check it equals `OrderPricing.total_charged` once a card fee exists |
| P4 | `Search unmatched transactions…` + candidates `Sep 5 · Wire · $18,674.05 · WHITFIELD`, `Sep 5 · ACH · $14,120.00 · ELEMETAL REFINING · no memo`, `Sep 4 · Wire · $9,870.50 · UMICORE PMR · "RS-2488"`, `Sep 3 · ACH · $2,215.00 · ASAHI REFINING · "inv 1106"` | `;333:9618;274:15`, `;333:9618;274:28;38:217…38:231` | `GET /api/payments/inbound/candidates`, `/unmatched` (`MatchRung`) | B |
| P5 | `Confirm match` | `;333:9661` | `POST /api/payments/inbound/:id/match` | B |
| P6 | Variant Due `292:5099` → `Request payment` `I292:5126;65:647`; `Method ACH Transfer` select | `292:5099` | `POST /api/payments/charges` (open), `POST /api/payments/charges/:id/request`; method `GET /api/payments/methods` | P: the routes exist. FOLLOWUPS §3: CREDIT is the only enabled non-card sale method, so no ACH/wire sale method row exists to select |
| P7 | Variant Processing `266:10671` (`Processing…`) | `I266:10698;65:655` | `transfer_state = Processing` | B |
| P8 | Variant Received `292:5175` (`Payment received`, disabled) | `I292:5202;65:655` | `transfer_state = Received` | B |
| P9 | Variants Not sent `266:10611` (`Send payment`), Sent `266:10737` (`Payment sent`), `Pay to Chase · Checking •••• 4417` | `I266:10638;65:647`, `I266:10764;65:655` | payout direction | B. These are not for a sale; the port must not render them on SO |
| P10 | Card payment (Stripe intent) state | NOT DRAWN: no variant shows card brand, last-4, `requires_payment_method`, `requires_action`, `processing`, `succeeded`, `canceled` | `payments.intents.status` (free `z.string()`); read only through `GET /api/stripe/get_sales_order_payment_intent?order_id=` (admin) | GAP: `PaymentView` has no intent. The only read is an untyped Stripe passthrough on a query parameter. No card brand or last-4 fact (M1) |
| P11 | Failed | NOT DRAWN | `transfer_state = Failed`, `failure_reason` | GAP: `payment_view.sql` filters `f.state <> 'Failed'`, so a failed charge disappears from the card (M1) |
| P12 | Credit applied / reserved | NOT on this card (Totals T5) | `payments.ledger` reservation (`credit.reserve` / `settleReservation` / `releaseReservation`) | P: no read says reserved, settled or released (M3) |
| P13 | Refund | NOT DRAWN | `payments.stripe_charges.amount_refunded`, `refunded_at` (reconciliation only) | GAP: no refund endpoint, action, transfer kind or ledger write anywhere in `api/src` (M2) |

### 1.7 Totals `358:4905` (set `170:2346`)

| # | Drawn | Node | Source | Status |
|---|---|---|---|---|
| T1 | Header amount `$18,674.05` | `;175:2470;32:24` | `OrderPricing.total` | B |
| T2 | `Items $17,850.00` | `;13:188` | `OrderPricing.items_total` (sale: `orders.transactions.items`, stored) | B (was gap #25) |
| T3 | `Shipping $24.00` | `;13:191` | `OrderPricing.shipping_charge` | B |
| T4 | `Sales tax $1,100.05` | `;13:194` | `OrderPricing.sales_tax` (`orders.transactions.sales_tax`, ruling 87) | B |
| T5 | `Credit applied −$300.00` (danger) | `;13:197` | `OrderPricing.credit_applied` (`orders.transactions.funds`) | B. Not a choice (ruling 47) |
| T6 | `Total due $18,674.05` | `;13:201` | `OrderPricing.total` (sale: items + shipping + tax − credit) | B |
| T7 | Card fee and total charged | NOT DRAWN | `OrderPricing.card_fee`, `total_charged` (media-port ruling; the Sales Invoice prints both) | GAP in design only: Totals has no `Card fee` row and no `Total charged`, so the card and the invoice cannot agree once a card fee exists (M10) |
| T8 | Refunded / net | NOT DRAWN | none | GAP (M2) |

Reconciles: 17,850.00 + 24.00 + 1,100.05 − 300.00 = 18,674.05. The Lots Price column sums to the same 18,674.05, not to Items 17,850.00 (W8).

### 1.8 Documents `358:4907` (library `1163:23945`, rows `1163:23874`)

| # | Drawn | Node | Source | Status |
|---|---|---|---|---|
| D1 | Count `4 documents` | `;661:1921;32:24` | `GET /api/orders/:id/documents` length | B |
| D2 | `Invoice · PDF · 44 KB · Sep 5, 2026` with Send / Download / Delete | `;549:17`, actions `;683:73`, `;548:13`, `;704:87` | `documentsFor` row `{kind:'invoice'}` | WON'T WORK: a sale's invoice is `sales_order_invoice` (written by `emails/service.ts:438`, rendered with `card_fee`/`total_charged`). `documentsFor` (`rules.ts:271`) ignores direction and lists `invoice`, so the stored sales invoice never shows and `invoice` gates on `isFinalized`, which a sale never reaches (W13) |
| D3 | Size `44 KB` and date | `;549:17;548:10` | `media.pdfs` row | GAP: `OrderDocument` = `kind, name, available, pdf_id`. No size, no created date |
| D4 | Send | `;683:73` | `POST /api/orders/:id/documents/:kind/send` | B |
| D5 | Download | `;548:13` | none by `pdf_id` | GAP: no `GET` for a stored PDF. Only the `POST /api/pdf/generate_*` routes exist |
| D6 | Delete | `;704:87` | none | WON'T WORK: `media.pdfs` is append-only. The library's own row description says "NO DELETE" (W14) |
| D7 | `Shipment Manifest · PDF · 29 KB` | `;549:28` | `{kind:'packing_list', name:'Shipment Manifest'}` | B (name matches; it is the sale's packing list) |
| D8 | `Shipping Instructions · Ready to generate` (layer `Return Shipment Manifest`) | `;549:39` | `{kind:'shipping_instructions'}` | WON'T WORK on a sale: shipping instructions tell a seller how to ship TO us. The API also lists `Return Shipment Manifest` here, which the design hides (W13) |
| D9 | `Assay Results · Not yet available` + Generate | `;919:98`, `;704:95` | `{kind:'assay_results', name:'Quote Estimate'}` | WON'T WORK: media-port ruling 2026-10-14, "a sales order gets no quote estimate"; also the name is now `Quote Estimate` (W13) |

### 1.9 Chat `358:4908` (library `1163:24111`)

| # | Drawn | Node | Source | Status |
|---|---|---|---|---|
| M1c | Title `Messages`; switcher Messages / Calls | `;661:2011;32:23`, `;636:142`, `;636:147` | `GET /api/sms?…` (`crm.sms_messages`), `GET /api/customers/:id/timeline` (calls) | B, per customer, not per order (prior §3 Q7 still open) |
| M2c | Day label `Today`; 3 messages with time and `· Delivered` | `;619:52`, `;619:51`, `684:39254` | `crm.sms_messages` `body`, `created_at`, `status` | B |
| M3c | Message text `…your order PO-2481 has been received…`, `…expect the payout?`, `…after we finalize` | `;619:51` (Message instances) | — | WON'T WORK as content: purchase copy on a sale (W15). Data only, no API impact |
| M4c | Attach (paperclip, MMS) | `;622:31` | none | GAP: `POST /api/sms` sends text; no media in the SMS domain |
| M5c | Field `Text the customer…`, Send | `;619:72`, `;619:76` | `POST /api/sms` | B |

---

## 3. WON'T WORK AS DRAWN

| # | What | Nodes | Reason |
|---|---|---|---|
| W1 | `Finalize` on a sale header | `I1108:22977;848:33` | Finalize is purchase-only (`finalizeBlockedBy`, `rules.ts:131`); a sale's money is fixed when it is placed. The sale header needs a sale action, or nothing |
| W2 | `Cancel` on a sale header | `I1108:22977;848:28` | No sale cancel exists. Ruling 88 requires cancel to release the credit reservation, and the Stripe intent must be cancelled after commit. Only the abandoned sweep does that (`sweeps.ts cancelPendingSale`) |
| W3 | Spots Locked with editable fields + `Unlock Spots` (and `Lock Spots` on Unlocked) | `358:4900`, `;495:6577`, `495:6572` | `PUT /api/orders/:id/spots` refuses sales and edits `bid` only. `actionsFor` still offers `lock_spots`/`unlock_spots` to sales, so the API offers an action it then refuses. A charged sale's spot is a frozen fact; it is read-only with no action |
| W4 | Lot prices "at the locked spot" | `;482:11129…11135;152:469` | Sale placement freezes `orders.spots` but leaves `spots_locked=false` and writes no lock event, so `view.sql`/`order_pricing.sql` price sale lines at the live ask. Totals uses the stored `items`. Lots and Totals drift apart every tick. Defect, not design. Verify on dev: `SELECT count(*) FROM orders.orders WHERE direction='sale' AND NOT spots_locked` |
| W5 | Declared value / coverage on a sale shipment | `237:4046` | `labels.ts:47` passes `0` for every sale, so outbound bullion ships uninsured. The input is also wrong: ruling 58 makes declared value the server's |
| W6 | Editable Qty / Premium / Shipping, `+` and Delete on a charged sale | `;152:470`, `;152:474`, `;37:1162`, `;489:4582`, `;489:4590` | A placed sale's `items`, `shipping`, `sales_tax`, `funds`, `surcharge` are stored facts charged to the customer (the comment in `order_pricing.sql`). Editing a lot changes the derived line but not the charge. Rows must be ReadOnly after payment, or every edit becomes a re-quote plus a charge or refund. Ruling 112: that is at least a confirm |
| W7 | `Batch` on a sale's Lots card | `;489:4586` | Batch sends on-hand customer lots to a refiner; sale lots are never on hand. Supply from a refiner is `POST /orders/:id/supply`, a different action |
| W8 | Lot Price figures | `;482:11129…11135;152:469` | Figures do not follow their inputs: 2 × 1 oz × 2,411.20 × 1.04 = 5,015.30, drawn 9,403.68; 10 × 2,411.20 × 1.03 = 24,835.36, drawn 4,612.40; 20 oz × 29.14 × 1.08 = 629.42, drawn 3,552.77; 10 × 1,022.75 × 1.06 = 10,841.15, drawn 1,105.20. Their sum (18,674.05) equals Total due, not Items (17,850.00) |
| W9 | Shipment `In Transit` while Payment `Due` | `;180:2524`, `;333:9584` | `order_state.sql` derives `Awaiting Payment` until a charge is Received, an intent succeeds or nothing is owed. Shipping before payment is allowed only through `ship`'s confirm "The customer has not paid for this order yet". The header badge (when shown) reads `Awaiting Payment` |
| W10 | Create Fulfillment Pickup, Return Shipment and Drop-off tabs/variants on a sale | `237:4275`, `296:5602`, `319:6160` | Carrier pickup collects from the customer; return exists only in purchase cancel; drop-off goes to a refinery. A sale uses Shipment or Appointment (DIRECT). Methods are already filtered by `direction` |
| W11 | `Payment Charge` drawn as an input | `;37:1179` | `surcharge` (card fee) is a fact from checkout with no write path; it is display-only |
| W12 | Storefront header on an admin screen | `358:4894` | The admin screen wears the public nav (`How it works …`); the admin shell is a different header |
| W13 | Documents rows Invoice, Shipping Instructions, Assay Results | `;549:17`, `;549:39`, `;919:98` | The sale invoice kind is `sales_order_invoice`; shipping instructions are inbound-only; the quote estimate is ruled out for sales. Sale set: `Sales Invoice` + `Shipment Manifest` (packing list), plus Intake Receipt / Appointment Instructions for DIRECT |
| W14 | Delete on a document row | `;704:87` | `media.pdfs` is append-only; the library row says no delete. Regenerate inserts a new row |
| W15 | Chat thread copy | `;619:51` | Purchase copy (`PO-2481`, payout) on a sale. Swap the copy; no API change |

---

## 4. MISSING FROM THE DESIGN

| # | State or control | Why the sale flow needs it | API today |
|---|---|---|---|
| M1 | Card payment states: Awaiting card, Requires action (3DS), Processing, Succeeded, Failed/declined, Canceled; card brand + last-4 | Most sales pay by card (Stripe intent). The Payment card draws only bank-rail states | `payments.intents.status` exists; typed read GAP (P10). Failed charge transfer hidden (P11) |
| M2 | Refunded / Partially refunded (amount, date, reason) | A short-ship, a deleted line or a cancel after capture must return money | GAP everywhere: no endpoint, no state, no ledger kind |
| M3 | Cancelled with credit released | Ruling 88: cancel and expiry release the reservation; the screen must say the $300 went back | Release is written (`releaseReservation`), but no read shows reserved / settled / released per order |
| M4 | Lot allocation from inventory: pick a stock lot, show source (`from Lot 2481-D`, `pool lock`, `RP-2493`), unallocated lines | Every bullion line must be sourced before it ships (lot model §4.7) | `POST /orders/:id/lots {lot_id}` (assign, `assertOnHand`) and `POST /api/refining/pool/locks` exist; no per-line source reference on the read (L13) |
| M5 | Awaiting stock / backorder: `Supply from refiner` action, linked RP order, ETA | Stock may not exist; `supply` creates and sends an RP buy order | `POST /api/orders/:id/supply`, `actionsFor` offers `supply`; no control drawn; the RP link is not on the sale view |
| M6 | Payment window expiry (ruling 85, ~1 h for admin-placed sales) with a countdown and an `Expired` state | Admin-created sales wait for the customer to pay; the sweep cancels | `sweepAbandoned(ttl)`; no `expires_at` on the read |
| M7 | Confirm and override dialogs (`ship` confirm "not paid", any edit to a charged sale) with the reason line | Ruling 112: confirm/override strings are server-computed and must be shown | `Action.confirm`/`override` returned; no frame draws them (prior §2 #10, still open) |
| M8 | Address change after label | A customer moves the delivery after the label is bought: void, re-label, re-tax | GAP: no route changes `recipient_address_id`; `cancel_label` exists; sales tax is stored and would not move |
| M9 | Signature required / adult signature | High-value bullion to a residence | GAP: no fact and no FedEx option |
| M10 | Card fee + Total charged rows in Totals | Totals must agree with the Sales Invoice (media-port ruling) | `card_fee`, `total_charged` exist |
| M11 | Empty Lots on a sale (no line yet) and empty Payment (no charge opened) | Admin-created sales and failed placements | reads return `[]` / null; frames missing |
| M12 | Loading and error states per card | Ruling 83: every route gets `loading.tsx`/`error.tsx` | n/a |
| M13 | Ships-to on the In Transit card | The operator must see where bullion is going without opening the label | `GET /orders/:id/address` |
| M14 | Delivered / Completed sale; Cancelled sale (header badge, cards read-only) | End states of the sale ladder | `order_state.sql` derives both |
| M15 | Insurance shown on the shipment card (declared value, coverage) | Proof the parcel is covered | fields exist on `OrderViewShipmentDetail`; values are 0 for sales (W5) |

---

## 5. Prior `api-gaps-orders.md` (2026-10-09) items that touch sales orders

| Prior # | Item | Status | Evidence |
|---|---|---|---|
| §1 #1 | State chip filter incl. Sales set | Closed | `OrderFilter.states`; `controller.ts:26 statesIn`; same `order_state.sql` fragment |
| §1 #2 | Assigned-to filter | Closed | `OrderFilter.assigned_to_id`, `unassigned` literal (`controller.ts:56-63`) |
| §1 #4 | Sort | Closed | `GET /api/orders/sorts`, `assertKnownSort`, `list_sorts.sql` |
| §1 #5 | Order and lot counts | Closed | `OrderList.counts {orders, unassigned_lots}` |
| §1 #6 | Lot rows on the card + destination (`on SO-1118`) | Closed | `OrderCardLot.destination`, `list.sql:113` |
| §1 #7 | `lot_count`, `$ est.` | Closed | `OrderListItem.lot_count`, `more_count`, `estimated_value` |
| §1 #8 | `Placed Sep 2` (sales) | Closed | `OrderListItem.placed_at` (`list.sql:89`) |
| §1 #9 | Search | Closed, prefix-only | `GET /api/search` (`SearchHit`); FOLLOWUPS: infix waits on `pg_trgm` |
| §1 #11 | `OrderState` 14 values | Closed | `contracts/computed/orders.ts:5-20` |
| §1 #12 | Draft | Superseded for sales | `Draft` is in the enum; no customer-order fact backs it (FOLLOWUPS facts lane); a sale is placed or nothing |
| §1 #20 | Linked fulfillment rows: customer, city, shipment state of each sales order | Closed | `refining/orders/sql/view_one.sql:160-167` `customer_name`, `city`, `stage` via the `sale` edge |
| §1 #25 | Sale Totals: items, shipping, tax, credit, total due | Closed | `order_pricing.sql` `card`/`billed` CTEs; `OrderPricing.items_total…credit_applied`; FOLLOWUPS: bottom line is `total`, no `total_due` field |
| §1 #26 | Tracker `Arrived` | Closed | `TRACKING_STAGES` + FedEx `AR` |
| §2 #4 | Sale Totals card wore the purchase field set | Closed (design and API) | `358:4905` reads Items / Shipping / Sales tax / Credit applied / Total due; comments log §2.4 |
| §2 #10 | No confirm / override drawn | Open | still no frame (M7) |
| §2 #14 | Profit Breakdown on a sale | Closed in design (hidden, not deleted); ruling Q6 still Jacob's | `358:4906` `hidden="true"`; comments log §2.12-14 |
| §2 #15 | Documents labels and Assay row | Superseded | names fixed (`Shipment Manifest`); Assay became `Quote Estimate` and is ruled off sales (media-port), so the sale card must drop it (W13) |
| §3 Q1 | Customer Draft state | Open (recommendation stands: refiner-only) | no `orders.orders` draft fact |
| §3 Q6 | Sale margin card | Open | card hidden; no sale-margin read |
| §3 Q7 | Messages per order or per customer | Open | `crm.sms_messages` has no `order_id` |
| §3 Q8 | One search endpoint | Closed | `GET /api/search` |
| Note | Payment card has no `Failed` state | Open, worse | `payment_view.sql` filters out Failed rows (P11) |

Items §1 #3, #10, #13–#19, #21–#24 and §2 #1–#3, #5–#9, #11–#13, #16 are purchase or refiner only; they do not touch the sale.

---

## 6. Mobile: no base exists

The port must infer the mobile sale screen from these cards:

- Entity Header `Layout=Mobile` (library `1148:24693`): stacked identity, hairline, full-width Select and buttons. Same W1/W2 action fix.
- Shipment / Mobile `179:2570` (8 variants; In Transit `179:2461`): use as is.
- Fulfillment / Mobile `209:3088`, Create Fulfillment / Mobile `237:5179`: show Shipment and Appointment only (W10).
- Spots / Mobile `170:2395`: read-only on a sale, no lock button (W3).
- Lots / Mobile `170:2421`: **no `Kind` axis** (Selection None/Some only). The bullion list must be built from Lots Row / Mobile `158:1175` Type=Bullion `158:1103`. Header actions: drop Batch; New only as "assign from stock".
- Charges / Mobile `170:2438`: both fields read-only on a sale.
- Payment / Mobile `170:2477` (11 variants): Due `292:5251`, Received `292:5327`, Matching `333:9666`. No card states (M1).
- **Totals has no mobile twin.** `170:2346` is desktop only. The order of the stack (Totals above or below Lots) is undecided.
- Documents and Chat: library components; no mobile instance on any sale frame.
- Stack order: no source. The purchase mobile screens (`834:21442`) are the only precedent.

---

## 7. API changes the port needs, ranked (smallest honest change each)

1. **Sale placement locks spots.** In `place.ts` sale path, call `orderSpotsService.applyLock(order_id, true, tx)` (or set `spots_locked` and record the `lock` event) beside `freezeForOrder`. Add a backfill migration for placed sales, with verify-before-write on dev. Fixes W4 and the drifting Lots column. (S5, L11)
2. **Insure sale parcels.** In `labels.ts:47`, pass the sale's goods value (`quote.item_total`) instead of `0`, clamped by `clampInsuredValue` as for purchases. (W5, F7)
3. **Sale cancel.** Let `POST /api/orders/:id/cancel` take a sale: stamp `cancelled_at` and `credit.releaseReservation` in one transaction, then cancel the intent / void the label after commit (`attempt`). Offer `cancel` in `actionsFor` for an uncancelled sale, with a confirm when a charge was received (refund owed). Reuse `cancelPendingSale`. (H7, W2, M3)
4. **Stop offering spot actions on sales.** In `actionsFor`, add `purchase &&` to `lock_spots` / `unlock_spots`. (W3)
5. **Direction-aware documents.** Give `documentsFor` the direction. Sale SHIPMENT = `sales_order_invoice` "Sales Invoice" + `packing_list` "Shipment Manifest"; sale DIRECT = `sales_order_invoice` + `intake_receipt` + `appointment_instructions`; no `assay_results`, no `return_packing_list`, no `shipping_instructions`. Gate `sales_order_invoice` on placement, not `isFinalized`. (D2, D8, D9)
6. **Show failed payments.** Drop `AND f.state <> 'Failed'` from `payment_view.sql` (order by state rank), or add `last_failure` beside the live row. (P11)
7. **Card state on `PaymentView`.** Add `intent_status` (an enum of the six Stripe values), `card_brand`, `card_last4`, `amount_received` from `payments.intents` / `payments.attempts`, in the same SQL read. Retire the query-param passthrough. (P10, M1)
8. **Guard edits to a charged sale.** `editLot`, `removeLot`, `POST /shipments/:id/charge`: `override` (ruling 112) when the sale has a received charge or a succeeded intent, with the reason stored. Refuse `addLot` OrderLotPatch on a sale as today. Point the design at "assign from stock" only. (W6)
9. **Per-line sourcing on the order view.** Add `source_reference` to `view.sql`/`view_for.sql` lot rows: the stock lot's `Lot NNNN-X` through the `sale` edge, the pool lock, or the `RP-` order through `refining.lots`. One more subquery. (L13, M4, M5)
10. **Document meta.** Add `size_bytes` and `created_at` to `OrderDocument` (both on `media.pdfs`), and `GET /api/orders/:id/documents/:pdf_id` to stream a stored PDF. (D3, D5)
11. **Our receiving account.** One `payments.receiving_accounts` row (or a `places.locations`-style settings row): name, bank, type, routing last-4, account last-4, sealed numbers per the bank rule. Expose last-4 only on the sale `PaymentView`. (P2)
12. **Refunds.** `POST /api/orders/:id/refunds {amount, reason}`: a `refund` transfer kind (or Stripe refund + `stripe_charges.amount_refunded`), a ledger row, and `refunded_total` on `OrderPricing`. Needs a Jacob ruling first: card refunds only, or also to credit. (M2, T8)
13. **Change ship-to after label.** `PATCH /api/orders/:id/address` (new snapshot) under a `confirm` that voids the label, plus a re-quote of sales tax when the state changes. Needs a ruling on tax. (M8)
14. **Signature.** A `signature` fact on `shipping.shipments` (enum `none|direct|adult`), defaulted per service in the database, sent as FedEx `signatureOption`. Ruling first. (F8, M9)
15. **Payment window.** `expires_at` on the sale read (placement + TTL the sweep already uses). (M6)
16. **MMS.** Media on `POST /api/sms`. Lowest; the Chat attach can ship hidden. (M4c)

**Counts.** Inventory rows: 87 (header 10, shipment 12, create fulfillment 9, spots 5, lots 13, charges 3, payment 13, totals 8, documents 9, chat 5; the fulfillment-slot and the three state sets are listed in prose). Status of the 87 rows: backed 47, partly backed 10, GAP 15, WON'T WORK 15. §3 lists 15 WON'T WORK findings (W1–W15). Missing from the design: 15 (M1–M15). Prior items touching sales: 22. Of these, 14 are closed, 5 open, 2 superseded and 1 closed in design only. Ranked API changes: 16. Items 1–10 need no ruling. Items 11–14 need a Jacob ruling first.
