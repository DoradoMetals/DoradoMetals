# Refiner orders: review before the Orders port

This review covers refiner sale RS-2493 and refiner purchase RP-2493. It compares the Figma file `ymmNlCDLVIfanpRQ7QHMIs` with the API on `dev` in this worktree. The API was read at commit `06d8bedd`.

**How the file was read (2026-10-14).** Each screen was read live with a read-only `use_figma` script. The script walks the visible TEXT and INSTANCE nodes and skips any node with `visible === false`, so hidden nodes are not in this review. Screens were also read with `get_metadata`. `get_design_context` was not called because the `figma-design-to-code` skill is not available in this session. Nothing in the file was changed.

**How the API was read.** The SQL, rules, routes and contracts were read. No test and no query was run. A row marked "verify" depends on code that was read but not executed.

**Legend for the Status column**
- `OK`: the endpoint, field or view exists.
- `GAP`: the API has no source for the fact or control. The row says what is missing.
- `WONT`: the design contradicts a ruling, the lot model, a stored fact or the money rule. Section 3 gives the reason.
- `COPY`: a label or text problem only.

**Path short forms**
- R = `api/src/domains/refining`
- DBR = `api/src/db/refining`
- DBI = `api/src/db/inventory`
- C = `packages/contracts/src`
- `vo` = `DBR/orders/sql/view_one.sql`
- `om` = `refining.order_money` (genesis, restated by migration 266)

Every refining route uses `requireAdmin` (`R/routes.ts:31-58`).

---

## 1-2. Inventory and source, per card

The screens in scope are:

- **RS desktop:**
  - 320:2717 (base)
  - 396:4895 (Draft)
  - 719:15329 (Pending)
  - 719:16091 (Settled, paid)
  - 743:38918 (Settled, pooled)
  - 719:16814 (Match lines drawer open)
- **RS mobile:** 721:17087, 721:17154, 743:39626, 721:17220
- **RP desktop:**
  - 358:6416 (base)
  - 380:4833 (Draft)
  - 729:34954 (Linked orders)
  - 849:32453 (Ships to us)
- **RP mobile:** 729:36214, 849:32937

### A. Entity Header (refiner), with Entity identity 1102:22810

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| A1 | Eyebrow `SALES ORDER` / `PURCHASE ORDER` / `DRAFT SALES ORDER` / `DRAFT PURCHASE ORDER` | `848:6` in 1108:22934, 1108:23020, 1108:23118, 1108:23063, 1104:* | `direction`, and `state='Draft'` (`DBR/orders/sql/refining_state.sql:17`) | OK |
| A2 | State badge: `Pending Assay`, `Settled`, `Awaiting Delivery` | 848:8;664:12752 / 664:12762 / 664:12757 on 1104:22886, 1104:22937, 1104:23091, 1104:23035, 1104:23144; mobile `848:50` | `state` (`refining_state.sql:14-23`); the enum is `OrderState` (`C/computed/orders.ts:5-20`, 14 values) | OK |
| A3 | Draft frames show no badge, only the eyebrow | 1108:23118, 1108:23063 | `state='Draft'` exists | OK (design choice) |
| A4 | `Elemetal Refining` | 848:13 | `refiner.organization.name` (`vo`) | OK |
| A5 | `RS-2493 · Dallas, TX` / `RP-2493 · Dallas, TX` | 848:15 | `number` is OK (it carries the RS- or RP- prefix). The city is not: `vo` returns only `location_id`, with no location name, address or city | GAP |
| A6 | `12 orders to date` | 848:17 | `orders_to_date` (`vo`) | OK |
| A7 | `Assigned to: Dana Whitlock` select | 848:20 | `assigned_to_id` through PATCH `/api/refining/orders/:id` (`RefiningOrderPatch`); the options come from `GET /api/employees` | OK |
| A8 | `Edit` tertiary | 848:28 on 1104:22886, 1104:22937, 1104:23091, 1104:23035, 1104:23144; mobile 848:68 | PATCH accepts `refiner_id` and `location_id` with no state guard (`R/service.ts:146`). There is no `edit` action, and no Mode=Editing frame | GAP (no action flag; no guard after send) |
| A9 | `Cancel` (secondary, danger) | 848:28 on 320:2717 and 358:6416; 848:33 on 1104:* | POST `/orders/:id/cancel`, action `cancel`. The handler deletes the order's `refining.lots` links (`DBR/lots/sql/delete_for_order.sql`). No confirm string exists | OK, but see D4 and section 4 |
| A10 | `Send` primary on an unsent order | 848:33 on 320:2717 and 358:6416 | POST `/orders/:id/send`, action `send` (`R/rules.ts:257-280`) | OK |
| A11 | `Send` primary on an RP that reads `Awaiting Delivery` | 1104:23035;848:38, 1104:23144;848:38, mobile 1106:23070;848:76, 1106:23179;848:76 | `send` is offered only while `sent_at` is null. `Awaiting Delivery` requires `sent_at`, and `assertSendable` answers 409 | WONT |
| A12 | `Lock ounces` primary on a pooled, settled order | 1104:23091;848:38, mobile 1106:23126;848:76 | action `lock_ounces`; POST `/api/refining/pool/locks` (`PoolLockCreate`); `lockConfirm` | OK (no lock form is drawn; see section 4) |
| A13 | Draft `Refiner` select `Elemetal Refining` | I1108:23118;893:441;1102:22811, I1108:23063;893:441;1102:22811 | options: `GET /api/suppliers/get_all`; write: `RefiningOrderCreate.refiner_id` / PATCH | OK |
| A14 | Draft `Location` select `Dallas · 1200 Regal Row` | 1102:22817 (same instances) | `GET /api/locations` (`api/src/db/places/locations/sql/get_all.sql`) returns every enabled location, with `organization_id` and `address_id` only: no address text and no organization filter. `RefiningOrderCreate` has no `location_id`, so only PATCH can set it | GAP |
| A15 | Draft number `RS-2493` / `RP-2493` printed beside `Create` | 1108:23118;848:15, 1108:23063;848:15 | The number comes from the shared sequence when the row is inserted (migration 228). A persisted draft has a number; an order not yet created cannot | WONT (see 3.2) |
| A16 | Draft `Create` primary | 1108:23118;848:33, 1108:23063;848:33 | POST `/api/refining/orders` takes `RefiningOrderCreate {refiner_id, direction, settlement_type?, lot_ids?}`. It does not take `location_id`, `assigned_to_id` or the fulfillment method. `assertNoOpenSellOrder` refuses a second open sell order for the same refiner | GAP |

### B. Fulfillment: Fulfillment, Drop-off, Shipment, Linked Fulfillment 371:8332 / 371:8408 / proposed 728:45748

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| B1 | Draft RS: `Fulfillment` with badge `Not set`; `Fulfillment method: We drop off`; `Deliver to: Elemetal · 1200 Regal Row, Dallas, TX`; note text | 396:5769 (379:8512, 379:8514, 379:8530, 379:8536, 379:8542) | POST `/api/fulfillments {refining_order_id, method_id}` calls `createForRefiningOrder` (`logistics/fulfillments/service.ts:434`), with drop-off as the default. `Deliver to` is the location, which has the same gap as A14 | OK / GAP (address) |
| B2 | Draft RP: `Fulfillment method: Drop ship to customer`; `Ship to: Marguerite Whitfield · 412 Oak Hollow Dr, Austin, TX` select | 380:5721 (379:8530, 379:8536) | No drop-ship method row was found: `grep -i "drop ship"` matches only a comment in `db/fulfillments/sql/view.sql`. Ship-to is a fact of the linked sale order; ruling 42 gives no foreign key | WONT (see 3.3) |
| B3 | Drop-off card `Scheduled`: Date, Refinery, Driver, Drop-off address, note, `Cancel Drop-off`, `Headed to Refinery` | 328:6328, 719:15335, 719:16097, 743:38924 | `GET /refining/orders/:id/fulfillment` returns a `FulfillmentView` built from `fulfillments.dropoffs` (`driver_employee_id`, window, `departed_at`, `dropped_off_at`); writes go through `/api/fulfillments/set_status` and `/cancel_schedule` | OK (verify that `Headed to Refinery` stamps `departed_at`) |
| B4 | Drop-off still `Scheduled` on the Settled and Pooled frames | 719:16097, 743:38924 | The metal must reach the refinery before an assay | WONT |
| B5 | RP base Shipment `Awaiting Tracking`: Ships from, Ships to, Carrier select, Tracking # input, `Save Tracking` | 380:4335 | POST `/api/shipments/:id/tracking` and PATCH `/api/shipments/:id` (see the prior audit's "already backed" list) | OK, but the copy contradicts B6 |
| B6 | Linked rows: `SO-1112` link · `Marguerite Whitfield · Austin, TX` · `Label Created`, then `SO-1118` · `Harlan Boyd · Plano, TX` · `In Transit`; footer `Tracking lives on each sales order` | 729:34960 (728:45693, 728:45696, 728:45697, 728:45700, 728:45703, 728:45704, 728:45684); mobile 729:36244 | The shape matches: `vo` `linked_orders {id, number, direction, reference, customer_name, city, stage}`. The data path does not. `vo:168-170` joins a `sale` edge whose source is the refiner lot. `supplyOrder`, through `DBR/lots/sql/assign.sql:38`, writes only a `batch` edge. The only test writes the `sale` edge by hand (`R/tests/worked-examples.test.ts:413-416`). `db/fulfillments/sql/view.sql:81-86` follows the `batch` edge instead | GAP (empty on the real path) |
| B7 | Old Linked Fulfillment: one `Linked order SO-1112`, `Shipment Label Created`, `Open SO-1112` button | 371:8253, 371:8333 | `FulfillmentView.linked_order` (`db/fulfillments/sql/view.sql:76-89`, LIMIT 1) | OK (superseded by 728:45748) |
| B8 | `Ships from: Elemetal Refining · Dallas, TX` | 728:45672, 728:45673; 380:4335;374:8431 | refiner name plus location city | GAP (as A5) |
| B9 | Ships to us, Shipment `In Transit`: Tracking #, ETA, and the stages Picked Up / Arrived / In Transit / Out for Delivery / Delivered | 849:32860 (179:2364;*) | The shipment on the refiner order's fulfillment. `TRACKING_STAGES` includes `Arrived` (`logistics/shipping/rules.ts:241-247`), and FedEx `AR` maps to `Arrived` (`providers/fedex/constants.ts:63`). The ETA is `est_delivery` | OK |
| B10 | Desktop reads `Arrived · Dallas, TX`; mobile reads `Arrived at Facility · MEMPHIS, TN`. A parcel from Dallas shows its first scan in `Austin, TX` | 849:32860 vs 849:33003 | — | COPY |
| B11 | Arrival moves the state from `Awaiting Delivery` to `Awaiting Payment` | 664:12757 on 1104:23144 | `fulfillments.arrivals.arrived` and `arrived_at` (migrations 185 and 261), read by `refining_state.sql:18-21` | OK |

### C. Spots (170:2226) on refiner orders

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| C1 | `Spots` Locked, with Gold `2,411.2`, Silver `29.14`, Platinum `1,022.75` | 320:2724, 358:6423, 729:34961, 849:32460 (269:9024 to 269:9026) | `GET /refining/orders/:id/spots` returns `RefiningSpot {metal_id, spot, lots, settled_lots}` (read only) | OK as a display |
| C2 | `Unlock Spots` icon button (`lock-open`) and editable spot Inputs | I320:2724;495:6577 (and the same on the 3 other cards) | A refiner order has no spot lock. The spot is per lot, `settled_spot`, stamped at settle (lot-model §1, "Spots are per pricing event"; ruling 123) | WONT |

### D. Lots / Refiner 338:10143 (17 variants), proposed 741:47884 (2), Item Row 398:9871 (2), proposed 741:46678 (4)

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| D1 | Title `Lots`; the proposed title is `Settlement` | 398:9874 and similar; 741:46681, 741:47292 | The proposed title repeats the aside card's title (742:20485) | COPY |
| D2 | Collapsed `5 items` | 398:10048, 398:10198, 440:5321, 440:5665, 472:11957 to 472:11963 | `lots.length` | OK |
| D3 | `+` add-lot icon button | 489:4718, 489:4738, 489:4758 | POST `/refining/orders/:id/lots {lot_ids}`. `assignLots` (`R/service.ts:157-167`) checks existence and "not already batched" only: it does not check cancelled, settled, direction or the on-hand position | OK / GAP (guards) |
| D4 | `trash-2` remove-lot icon button (enabled when Selection=Some) | 489:4726 and the like; 472:10814, 472:11000, 472:11397, 472:11577 | DELETE `/refining/lots/:id` (`R/service.ts:169-175`) has no state guard. `DBR/lots/sql/delete.sql` deletes only the link, so the minted refiner lot and its `batch` edge stay. That orphan then passes `DBI/lots/sql/own_lot.sql`, and its source returns to `on hand` (`position.sql:20-26`). The same metal is counted twice. Cancel does the same through `delete_for_order.sql` | GAP (inventory double count; verify) |
| D5 | `combine` icon button; the Combined variant `Refiner lot R-2493-1 · 2 lots`, `$7,282.66 · 2 lots` | 489:4722, 474:11452 | POST `/api/lots/combine` combines our on-hand lots and re-points the refiner lot's batch edge to the result (`inventory/service.ts:29-46`). No endpoint merges two refiner lots on one refiner order, which the lot model allows ("one refiner lot with N batch edges") | GAP |
| D6 | Row: item link `14 Karat Gold` / `14K / 18K Gold`; lot link `Lot 2481-A`; order link `PO-2481` | 467:10275, 410:8931, 410:8925; 741:46587, 741:46588, 741:46590; 840:31087, 840:31088, 840:31090 | `lots[].lot.product_name`, `form`, `lots[].sources[].reference`, `lots[].order_reference` (`vo`). Note: the `LotEdge` contract (`C/inventory/lot_sources.ts:24`) strips the `order_*` fields the SQL emits on each edge | OK |
| D7 | Row `Combined · 2481-A + 2481-B` · `PO-2481` | 741:46698;741:46588 (719:15337, 719:16099, 743:38925) | `combine.sql` and `combine_parents.sql` give the combined lot no `orders.lots` row. The `vo` edge reference and `order_reference` derive from an `orders.lots` seat, so both are null. Nothing returns the parents' references | GAP (verify) |
| D8 | `Qty` Input (`—`, `2`, `10`) | 429:5026; 840:31091 | `RefiningLotPatch` picks `pre_melt, post_melt, purity, unit, premium, settled_spot, line_reference`, not `quantity` | GAP (or make it a display) |
| D9 | `Post Melt` g, `Purity` %, `Premium` % Inputs | 427:4920, 411:8921, 415:8937; 741:46592 to 741:46594; 840:31094 | PATCH `/refining/lots/:id` (`RefiningLotPatch`), or the settle body per lot | OK |
| D10 | `Price` (`$5,102.40` and so on) | 410:8923 / 410:8953; 741:46595; 840:31096 | POST `/api/quotes/refining_order` → `RefiningPricing.lots[].price` (`db/pricing/sql/refining_pricing.sql`) | OK |
| D11 | Proposed `Spot` column: `—` while pending; `$2,411.20` / `$29.14` once settled | 741:46628, 840:31095 | `lots[].lot.settled_spot`, also `RefiningPricing.lots[].settled_spot`. It is null until settle; `DBR/lots/sql/settle.sql` is its only writer besides PATCH | OK |
| D12 | Pooled variant: `Spot —` and `Price —` | 741:47309;741:46677 / 741:46644, 840:31112, 840:31113 | Ruling 123 (`docs/waves/pool-spot.md` §1): `settle.sql` stamps `settled_spot` (the market spot) on pooled lots too | WONT for Spot; OK for Price (a pooled sell has no settlement money in `om`) |
| D13 | Bullion rows: Qty and Premium only, Post Melt and Purity `—` | 440:5190, 840:31080, 840:31097 | `content_snapshot` × `quantity` | OK |
| D14 | RP rows `Lot 1112-A` · `SO-1112`, premium `104%` | 440:6530, 729:34962, 849:32461 | `supplyOrder` mints a refiner lot from each sale lot through a `batch` edge; `premium` is on the lot | OK |
| D15 | Item Row `Editable=False` | 398:9841 | `actions.edit_lots` is false when the order is cancelled or settled; `sentConfirm` applies after send | OK |
| D16 | Set description says the head reads `Item · Weight · Purity · Premium · Value`; the drawn head reads `Price` | 338:10143 | — | COPY |

### E. Charges (170:2277) on refiner orders

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| E1 | `Payment Charge $20.00` Input | 37:1179 on 320:2726, 719:15338, 719:16100, 743:38926 | `om.payment_charge` is `max(payments.methods.flat_fee)` of the order's transfer rail (migration 266, lines 51-54). It is derived and has no write | WONT (as an Input) |
| E2 | `Pool Oz Remediated 0.003 oz` Input | 331:5796 (same cards) | `totals.pool_oz_remediated` (migration 263), the sum of the order's pool locks. It is derived | WONT (as an Input) |
| E3 | RP `Payout Charge 12.50` | 37:1179 on 358:6425, 729:34963, 849:32462 | `om.payment_charge`. Two problems: we pay the refiner, so "payout" is the wrong word, and the Totals card on the same screen reads `Payment charge $20.00` (13:194) | WONT (does not reconcile) |
| E4 | RP `Shipping Charge 24.00` | 37:1162 (same cards) | `totals.shipping` is carriage (migration 263) and enters the buy total. The RP Totals cards have no Shipping row | WONT (does not reconcile) |
| E5 | No refiner `fee` input anywhere | — | `refining.orders.fee` is the one stored money input. PATCH and the settle body both accept it | MISSING (section 4) |

### F. Payment (170:2316) on refiner orders

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| F1 | RS `Matching`: badge `Due`; Account name `Dorado Metals`, Bank `Truist`, type, Routing ••••0442, Account ••••8813; `Amount $14,120.00`; `Search unmatched transactions…`; four candidate options; `Confirm match` | 452:12323, 719:15339, 719:16101 (333:9583 to 333:9661) | `payment {state, amount_due, …}` (`vo`), the rails inbound-match list and confirm, and the actions `request_payment` and `mark_received` | OK as fields |
| F2 | `Amount $14,120.00` | 333:9604 on 719:15339 and 719:16101 | `payment.amount_due` = `om.total`. The Totals cards on the same frames read 13,386.77 and 17,266.72 | WONT (money cards must reconcile; comments log line 220) |
| F3 | Our receiving bank block on an RS | 333:9588 to 333:9601 | `payment.payout_account` is the payee's `payments.details` row. On a sell order the payee is us, and no field names our receiving account | GAP (verify) |
| F4 | Pooled: badge `Pooled`, `Settlement: Pooled · no payment due`, bank block still visible | 743:38927 | `vo` returns `payment: NULL` for a pooled sell (`vo:197`), so the card has no source for its bank block or its badge | WONT (the bank block); COPY (the rest) |
| F5 | RP `Not sent`: `Elemetal Refining LLC`, JPMorgan Chase, ••••2210 / ••••7731, `Amount $17,553.61`, `Method: Wire`, `Pay to: Chase · Checking •••• 4417`, `Send payment` (disabled) | 452:12502, 729:34964, 849:32463 (266:10613 to 266:10638, 374:8620) | `payment.pay_to`, `payout_account`, `amount_due`; action `send_payment` (confirm `not settled yet`, override for a second payout); POST `/api/payments/payouts` and `/:id/send` | OK as fields |
| F6 | RP amount 17,553.61, against Totals 13,346.09 and a lot sum of 18,674.05; one payee shows two last-4s (7731 and 4417) | 266:10634, 358:6428, 440:6530 | — | WONT (does not reconcile) |
| F7 | `Send payment` disabled with no reason line | 266:10638 | `send_payment` carries a **confirm**, not a refusal (ruling 112). The button should be enabled and show the reason | WONT |

### G. Totals (170:2346) on refiner orders

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| G1 | RS pending: `Settlement $14,120.00 · Refiner fee $706.00 · Payment charge $20.00 · Pool remediation $7.23 · Total $13,386.77` | 719:15341 | `expected_settlement`, `totals.fee`, `payment_charge`, `pool_remediation`, `total` (`vo`; `om`; migration 266, line 30) | OK (the table prints every Price as `—` while the header prints 14,120; the API figure is a live-spot estimate) |
| G2 | RS settled: `18,204.16 · 910.21 · 20.00 · 7.23 · 17,266.72` | 719:16103 | same fields; the lot prices sum to 18,204.16 | OK |
| G3 | RS pooled: header `43.620 oz`; `Settlement 43.623 oz credited`; `Refiner fee —`; `Payment charge —`; `Pool remediation 0.003 oz`; `Total 43.620 oz` | 743:38929 | `pool_oz` and `pool_oz_remediated` exist. But the total adds gold and silver ounces into one number, and `om.total` for a pooled sell is dollars (−fee − remediation − charge − carriage) | WONT |
| G4 | The customer-purchase field set: `Scrap · Bullion · Shipping · Payout fee · Total payout $13,346.09` | 320:2729, 396:4906, 380:4845, 849:32465, and the background of 719:16814 | A refiner order has none of these fields | WONT (prior §2 row 4 is still open on 5 frames) |
| G5 | RP: `Settlement $13,200.00 · Refiner fee $126.09 · Payment charge $20.00 · Pool remediation — · Total $13,346.09` | 358:6428, 729:34966 | The fields exist (buy total = settle + fee + charge + carriage). The card has no Shipping row while Charges shows 24.00, and Settlement differs from the lot sum (18,674.05) | WONT (does not reconcile) |

### H. Settlement aside: old 327:9783, proposed 742:20760 (4 variants) and mobile 743:20841 (4 variants)

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| H1 | Old card: `Pending assay`, `Estimated fine oz 4.812 oz`, `Settled —`, `Variance —`, `Assay lab Elemetal · Dallas`, `Expected settlement $14,120.00` | 328:6573 (327:9722) | `estimated_content`, `settled_content`, `variance`, `assay_lab`, `expected_settlement` (`vo`) | OK (COPY: the API casing is `Pending Assay`) |
| H2 | Badge `Pending assay` (lower case a) | 742:20487, 743:20567 | The API says `Pending Assay` (`refining_state.sql:7-8`) | COPY |
| H3 | `Record settlement` primary (SM) | I719:15342;1080:22516; mobile 1080:22532 | POST `/orders/:id/settle` with `RefiningSettlement {fee?, statement_reference?, lots[{lot_id, pre_melt?, post_melt?, purity?, unit?, premium?, settled_spot?, line_reference?}]}`; confirm from `settlementConfirm` or `premiumConfirm` | OK (no `fee` or `statement_reference` input is drawn) |
| H4 | Chips `Paid at settlement` / `Pooled`; enabled while Pending, disabled once Settled | 922:13527 / 922:13535; 922:13567 / 922:13575; 922:13584 / 922:13592 | PATCH `settlement_type`. `RefiningOrderPatch` has no guard after settle (`R/service.ts:146`), although the pool credit was already written at settle (`DBI/pool/sql/credit.sql`) | OK in the design / GAP in the API |
| H5 | `Estimated fine oz 43.162 oz` · `Settled fine oz 43.623 oz` · `Variance 0.461 oz` | 742:20490 to 742:20497, 742:20580 to 742:20587, 742:20628 to 742:20635 | `vo:228-238` sums `content × quantity` over every metal on the order (gold and silver together) | WONT (both the design and the API) |
| H6 | `Settled fine oz: Pending` before settle | 742:20494 | `vo` `settled` sums the refiner lot's `content`, which is copied at mint, so it is non-null before settle. Variance reads 0, not null | GAP |
| H7 | `Expected settlement $14,120.00` on the Settled, paid frame | I719:16104;742:20594 | After settle, `expected_settlement` equals the settled money: 18,204.16 on the same frame (G2) | WONT (stale figure) |
| H8 | `Credited to pool 43.623 oz` | 742:20642 | `pool_oz` (`vo:150`) is the `inventory.pool` credit = Σ `content × premium × quantity` (`credit.sql`). It equals settled fine oz only at a premium of 100%. It is also per metal | WONT (drawn number) |
| H9 | Pending, pooled: `Credited to pool —` | 742:20529, 743:20610 | No credit exists before settle | OK (prior §2 row 7 is closed) |
| H10 | No `Dispute` control | 742:20760 | Coordinator ruling: "Record settlement yes / Dispute never" (`orders-comments-log.md:220`). The API still offers the `dispute` action (`R/rules.ts`), and `disputed_at` is on PATCH | OK in the design; the API action is dead (section 6) |

### I. Documents card rows on refiner orders

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| I1 | RS `Invoice · PDF · 48 KB · Sep 5, 2026` | 549:17 on 320:2731, 719:15343, 719:16105, 743:38931 | `refining.documents` row `invoice`, named **`Refiner Invoice`**, renderable (migration 264); GET `/orders/:id/documents` | OK (COPY: the names differ) |
| I2 | Row icon `send` | 549:17;683:73 on every refiner Documents card | No Send on a refiner order's Documents (FOLLOWUPS, line 373; ruling 15: email is manual) | WONT |
| I3 | Row icon `trash-2` (delete) | 549:17;704:87 | `R/routes.ts:31-58` has no DELETE for a document | GAP |
| I4 | Row icon `download` | 549:17;548:13 | the stored `pdf_id` | OK |
| I5 | `Settlement · Not yet available` (base) / `Awaiting refiner · Import` | 549:28 on 320:2731, 719:15343, 719:16105, 743:38931 | `available` = a row is stored (`R/rules.ts:282-296`); POST `/orders/:id/documents/settlement` (multipart) | OK |
| I6 | RP `Customer Invoice · PDF · 44 KB · Sep 5, 2026 · SO-1112` | 549:17 on 358:6430, 729:34967, 849:32466, 380:4846 | Not a `refining.documents` kind. It is the linked sale order's file, and no refining read returns it | GAP |
| I7 | RP `Refiner Invoice · Awaiting refiner · Import`; `Packing List · Awaiting refiner · Import` | 549:28, 549:39 | The rows exist. But `invoice` is `renderable = true`, so on any sent order it reads available without an import (`rules.ts:293`). `refining.documents` has no direction column, so both directions get all four rows | GAP |
| I8 | Draft RS `Lot Manifest` | 396:4909 (549:17) | `lot_manifest` is in `media.pdf_kind` but not in `refining.documents` | GAP |
| I9 | RS draws 2 rows; RP draws 3; the API returns 4 for every refiner order (Shipping Instructions is drawn nowhere) | — | the migration 264 seed | GAP (same fix as I7) |

### J. Match settlement lines drawer: 1160:22869 (MD) / 1160:23348 (Full); bodies 1047:22078 / 1048:31893

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| J1 | Opens from the Documents Settlement row `Import` | 549:28 → 1160:22869 | The upload is OK (I5). Nothing parses the file (`settlement_lines.sql:6`: "Nothing is written and nothing is parsed here") | GAP |
| J2 | MATCHED lines: `ELM-88431 · 139.0 g · 58.1%` → `2.531 oz`; `ELM-88432 · 60.4 g · 72.6%` → `1.410 oz`; `ELM-88433 · 1,196 g · 92.0%` → `35.39 oz` | 719:15188, 815:24 to 815:36, 719:15192, 719:15203, 719:15214 | GET `/orders/:id/settlement-lines` returns `{id, lot_id, line_reference, metal_id, unit, post_melt, purity, reference, fine_oz, matched_lot_id, matched_reference, matched_order_reference, status}`. These are **our** refiner lots. The invoice line's own figures exist only after they are written onto a lot | GAP (no parse) |
| J3 | Select per line: `2481-A · 14K Gold`, `2481-B · 18K Gold`, `2481-C · Sterling Silver` | 719:15194, 719:15205, 719:15216 | `matched_reference` and `matched_order_reference`; the options are the order's lots | OK |
| J4 | A and B are matched separately, but the order's table holds them as one combined refiner lot | 719:15194 and 719:15205 vs 741:46698;741:46588 | One refiner lot carries one `line_reference` | WONT |
| J5 | UNMATCHED `ELM-88434 · 41.2 g · 61.0%` `0.808 oz`, `Choose a lot` | 719:15224, 719:15228, 719:15230 | The API's `unmatched` means a refiner lot with no batch source and no line reference (`settlement_lines.sql:41-44`). An invoice line with no lot has no row anywhere | GAP (the word means something else) |
| J6 | NOT ON INVOICE `2488-A · 10K Gold` `4.199 oz est.`, `Attach an invoice line` | 719:15238, 719:15242, 719:15244 | `status = not_on_invoice`, `fine_oz` | OK |
| J7 | EXTRA ON INVOICE `ELM-88435 · 12.0 g · 33.0%` `0.127 oz`, with no control | 719:15252, 719:15256 | `extra_on_invoice` needs a refiner lot with no batch source, and no endpoint creates one, so the state is unreachable. No action is drawn | GAP + MISSING |
| J8 | Bullion lots 2481-D and 2481-E appear in no section | 1047:22078 | The read returns every refiner lot, so these would show as `not_on_invoice` | COPY / decision |
| J9 | `Apply matches` / `Cancel` | 1056:2572, 1056:2571 | No write; this is intended (prior §1 row 24). The matches travel in the settle body as `lots[].line_reference`, or through PATCH `/refining/lots/:id` | OK |
| J10 | The mobile drawer exists, but the mobile frames have no Documents card | 721:17220 | — | MISSING |

### K. Mobile twins, and L. Chat

| # | Fact or control | Node(s) | Supplied or accepted by | Status |
|---|---|---|---|---|
| K1 | RS mobile shows the header and the Settlement card only; the text says `His Lots / Refiner has no mobile twin` | 721:17087, 721:17154, 743:39626, 721:17220 | Lots, Charges, Payment, Totals and Documents are absent on mobile | MISSING |
| K2 | RP mobile shows the header plus Linked Fulfillment (729:36244) or Shipment (849:33003) only | 729:36214, 849:32937 | same | MISSING |
| L1 | No Chat card on any of the 16 refiner frames | all | No order-scoped or organization-scoped thread exists (`crm.sms_messages` and `calls` are keyed by `user_id`) | OK (nothing is owed) |

---

## 3. WON'T WORK AS DRAWN

1. **`Send` on a sent RP** (A11: 1104:23035;848:38, 1104:23144;848:38, 1106:23070;848:76, 1106:23179;848:76).
   - `Awaiting Delivery` requires `sent_at`, and `send` is offered only while `sent_at` is null.
   - `supplyOrder` sends at once (`R/service.ts:255`).
   - Comments log line 224 says post-send screens have no primary; these four still have one.
2. **Draft number shown beside `Create`** (A15: 1108:23118;848:15, 1108:23063;848:15).
   - The number comes from the sequence when the row is inserted (migration 228).
   - Either the draft already exists, and then the primary is `Send`, or it does not, and then it has no number.
3. **Draft RP `Ship to` select** (B2: 380:5721;379:8536).
   - Ship-to is a fact of each linked sale order (ruling 42: no FK; the link derives through lots).
   - 729:34960 shows two sale orders, and one select cannot hold both.
4. **Drop-off `Scheduled` on settled frames** (B4: 719:16097, 743:38924). An assay cannot happen before the metal reaches the refinery.
5. **Spot lock on a refiner order** (C2: I320:2724;495:6577, plus the Inputs). Spot is per lot (`settled_spot`), stamped at settle (lot-model §1; ruling 123). No lock exists to open.
6. **Pooled lot `Spot —`** (D12: 741:47309;741:46677 and similar). Ruling 123: `settle.sql` stamps the market spot on pooled lots. The dash hides a stored fact.
7. **Charges Inputs for derived figures** (E1: 37:1179; E2: 331:5796).
   - `payment_charge` is the rail's `flat_fee`.
   - `pool_oz_remediated` is the sum of the order's locks.
   - Neither has a write.
8. **The RP money cards do not reconcile** (E3, E4, F6, G5: 358:6425, 358:6428, 452:12502, and the copies on 729:* and 849:*).
   - The lot sum is 18,674.05, Totals Settlement is 13,200.00, Total is 13,346.09, and the Payment Amount is 17,553.61.
   - Charges shows `Payout Charge 12.50` while Totals shows `Payment charge 20.00`.
   - Charges shows `Shipping Charge 24.00`, but Totals has no shipping row.
   - Rule broken: money cards must reconcile (`orders-comments-log.md:220`).
9. **RS Payment Amount ≠ Total** (F2: 333:9604 on 719:15339 and 719:16101). `amount_due` is `om.total`: 13,386.77 pending and 17,266.72 settled, not 14,120.00.
10. **Pooled Payment bank block** (F4: 743:38927). `payment` is NULL for a pooled sell (`vo:197`).
11. **`Send payment` disabled** (F7: 266:10638). Ruling 112: an unsettled order is a confirm, not a refusal.
12. **Pooled Totals in ounces, summed across metals** (G3: 743:38929).
    - Ounces of gold and silver are not one quantity, and the pool is per refiner per metal (FOLLOWUPS §5 Q3).
    - `om.total` is dollars.
    - The fee is cash (FOLLOWUPS §5 Q10), so `Refiner fee —` hides money still owed.
13. **Customer-purchase Totals field set on refiner orders** (G4: 320:2729, 396:4906, 380:4845, 849:32465, and the background of 719:16814).
14. **Fine oz summed across metals** (H5: 742:20490/20491, 742:20493/20494, 742:20496/20497).
    - `43.162` adds gold and silver.
    - The API does the same (`vo:228-238`). Both sides must change.
15. **Stale `Expected settlement` on a settled order** (H7: I719:16104;742:20594). It shows 14,120.00 where the same frame's settlement is 18,204.16.
16. **`Credited to pool` = settled fine oz** (H8: 742:20642). The credit is content × premium × qty (`credit.sql`). It cannot equal the settled fine oz unless the premium is 100%.
17. **Send icon on refiner Documents** (I2: 549:17;683:73). Ruling 15 (email is manual); FOLLOWUPS line 373 ("no Send on a refiner order's Documents card").
18. **Match lines split a combined lot** (J4: 719:15194 and 719:15205 vs 741:46588). One refiner lot carries one `line_reference`.
19. **Linked Fulfillment copy vs RP Shipment card** (B5 vs B6: 380:4335;374:8442 vs 728:45684).
    - One card says to enter the refiner's tracking on the RP.
    - The other says tracking lives on each sales order.
    - With two sales orders, one tracking field on the RP cannot serve both.

---

## 4. MISSING FROM THE DESIGN

1. **Partial settlement.**
   - `settle` accepts a subset of lots, and `settlementConfirm` says "X of Y lots are not settled".
   - The first call stamps `refining.orders.settled_at` (`DBR/orders/sql/settle.sql`), and every later call is refused (`assertSettleable`).
   - No frame shows a per-lot "settled" mark, and no frame says the rest are closed out. The customer side already says "4 of 5 settled".
2. **Disputed assay.**
   - Ruled "Dispute never" (comments log line 220).
   - The API still derives `Disputed` from `disputed_at` (PATCH), and `Order State` 664:12772 draws it. No frame shows a disputed order or how it leaves that state.
3. **Returned lots.**
   - A refiner can refuse or return a lot.
   - No lineage kind, no endpoint and no frame exist. Today the only path is remove (D4), which double counts.
4. **Cancelled refiner order.**
   - Cancel releases every lot (`delete_for_order.sql`).
   - No `Cancelled` frame and no confirm exist. The lots go back to `on hand` silently.
5. **Empty order.** `assertSendable` refuses an order with no lots. No empty Lots state is drawn for a fresh draft.
6. **Loading and error states.** None is drawn for these errors:
   - 409 `assertNoOpenSellOrder` on Draft RS Create (one open sell order per refiner)
   - 409 `assertUnassigned` on add-lot
   - 400 `assertPooledHasNoSpot` on settle
   - 400 `assertBatchGrain`
   - an import upload failure
7. **Confirms (ruling 112).** None is drawn on a refiner frame. These actions carry one:
   - `edit_lots` after send (`sentConfirm`)
   - `settle` (`settlementConfirm` / `premiumConfirm`)
   - `send_payment` (confirm and override)
   - lock (`lockConfirm`)
   - cancel (it releases lots)
8. **The `Lock ounces` form** (A12). `PoolLockCreate` needs metal, ounces and price or purpose. No drawer or dialog exists.
9. **Refiner fee and statement reference inputs** (E5, H3). They are the two order-level settle inputs, and neither has a control.
10. **RS payment states after `Due`.**
    - `request_payment` and `mark_received` exist as actions but are not drawn.
    - The `Received` and `Failed` states are not drawn.
11. **RP states after `Awaiting Delivery`.**
    - The `Awaiting Payment`, payout `Processing`/`Sent` and `Completed` frames are absent.
    - The API has no `Completed` rung for a buy order (`refining_state.sql:14-23`), but `statuses.md:248` wants one.
12. **Receiving an RP that ships to us.** No control marks the parcel received when the carrier has no `Delivered` scan, for example a hand delivery.
13. **Extra invoice line resolution** (J7). The drawer has no action for it.
14. **Mobile lots, charges, payment, totals and documents** (K1, K2). On mobile, the Settlement row's Import (the drawer's entry) is unreachable.
15. **Batching into an existing open sell order.**
    - `POST /refining/orders/batch` appends to the refiner's open sell order.
    - The Draft RS frame implies a new order each time, and no frame shows "added to RS-xxxx".
16. **Changing the refiner after send.** Comments log line 56 proposes the Drop-off card. Nothing is drawn, and PATCH has no guard.
17. **Permissions.** Every route is admin-only. No read-only or no-access state is drawn, which is fine while only admins reach `/admin`. It is noted here so the port does not invent one.

---

## 5. Prior `api-gaps-orders.md` items that touch refiner orders

| Prior item | Status | Evidence |
|---|---|---|
| §1-11: OrderState with 14 values; refiner state untyped | Closed | `C/computed/orders.ts:5-20`; refiner orders use the shared enum |
| §1-12: `Draft` rung | Closed | `refining_state.sql:17` |
| §1-14: `line_reference` per invoice line | Closed | migration 262; `Lot`, `RefiningLotPatch` and the settle body carry it |
| §1-15: per-lot settlement price | Closed | POST `/api/quotes/refining_order` → `lots[].price` (`C/pricing/quotes.ts:167-204`) |
| §1-20: linked orders carry name, city and stage | Closed in shape, open in data | `vo:160-195` has the fields; the join reads a `sale` edge that no code path writes (B6) |
| §1-21: shipping term on the refiner order | Closed | `om.shipping` (263); carriage is in both totals (migration 266, line 30) |
| §1-22: `pool_oz_remediated` | Closed | `om` (263); `vo` totals |
| §1-23: refiner Documents rows and the `refiner_invoice` enum | Partly closed | `refining.documents` table plus 4 rows (264) is closed. The enum is superseded: `invoice` is named `Refiner Invoice`. A per-direction set is open (I7) |
| §1-24: settlement-lines endpoint | Partly closed | GET `/orders/:id/settlement-lines` (read) exists. The parse is open (J1, J2) |
| §1-26: tracker `Arrived` | Closed | `logistics/shipping/rules.ts:241-247`; `fedex/constants.ts:63` |
| §2-1: RS-/RP- numbering in the frames | Closed | every refiner frame reads RS-2493 or RP-2493 |
| §2-2: Record settlement / Dispute | Closed / superseded | 1080:22516 is drawn; Dispute was ruled out (comments log line 220) |
| §2-3: `Finalize` on refiner orders | Closed, with a new defect | it now reads `Send` or `Lock ounces`, but `Send` stays on the sent RP frames (3.1) |
| §2-4: Totals field set on refiner orders | Partly closed | fixed on 719:15341, 719:16103, 743:38929, 358:6428, 729:34966; open on 320:2729, 396:4906, 380:4845, 849:32465 and the 719:16814 background |
| §2-5: Spot on a pending order | Closed on 719:15329; open on the 719:16814 background | spot and price still show on the drawer frame |
| §2-6: settled prices follow their inputs | Closed | 719:16099 prices were re-derived (comments log line 226) |
| §2-7: pooled pending credited ounces | Closed | 742:20529 reads `—` |
| §2-8: Payment card on a pooled order | Partly closed | amount and match were removed; the bank block and badge remain with no source (F4) |
| §2-9: `Edit` entry | Closed in the frames | `Edit` is on every 1104:* header; Mode=Editing is still not drawn |
| §2-10: confirm, override and step-up drawn | Open | none on the refiner frames (section 4, item 7) |
| §2-16: `Batch into` label; batch by `order_ids` | Closed | `RefiningBatch {refiner_id, lot_ids?, order_ids?}`; `assertBatchGrain` |
| §3-Q1: Draft is refiner-only | Closed | as row §1-12 |
| §3-Q2: Record settlement warns | Closed | `settlementConfirm` is a confirm |
| §3-Q3: invoice line addressable | Closed | migration 262 |
| §3-Q5: refiner charges | Superseded | shipping was kept (263/266), not dropped; the fee is in Totals; Charges still lacks a fee input |
| §3-Q10: Title Case `Pending Assay` | Closed in the API, open in Figma | 742:20487, 743:20567 and 327:9759 still read `Pending assay` |
| §3-Q11: combine spans two purchase orders | Open (verify) | allowed, but a combined lot has no `orders.lots` seat, so its reference reads null (D7) |
| Footnote: `statement_reference` and `fee` never shown | Open | no control (section 4, item 9) |

---

## 6. API changes the port needs, ranked

Each item gives the smallest honest change. Items 1 and 2 are first because they corrupt facts today; the rest follow in order of how many frames they unblock.

1. **Inventory double count after remove or cancel** (D4).
   - Add `AND NOT EXISTS (SELECT 1 FROM inventory.lot_sources s WHERE s.lot_id = li.id AND s.kind = 'batch')` to `DBI/lots/sql/own_lot.sql`.
   - This is read-only and deletes nothing.
   - Add a test: remove a lot, then count the inventory.
2. **`linked_orders` is empty on the real path** (B6).
   - In `vo:168-170`, follow the `batch` edge the way `db/fulfillments/sql/view.sql:81-86` does: refiner lot → `source_lot_id` → `orders.lots`, limited to direction `buy` and sale orders.
   - Replace the test's hand-inserted edge with a real `supplyOrder`.
3. **Fine ounces per metal** (H5, G3, H8).
   - In `vo`, return `estimated_content`, `settled_content`, `variance` and `pool_oz` as a per-metal array, and drop the scalar sums.
   - Sum `settled` only over lots with `settled_at` (H6).
4. **Guards** (D3, D4, H4, A8). All changes are in `rules.ts`:
   - `assignLots`: refuse a cancelled or settled order, the wrong direction, or a lot not on hand.
   - `removeLot`: refuse once the order is settled.
   - PATCH: refuse a change to `settlement_type` once the order is settled, and a change to `refiner_id`/`location_id` once it is sent.
5. **Location on the read and on create** (A5, A14, A16, B1, B8).
   - Return `location {id, name, line_1, city, state}` in `vo`.
   - Accept `?organization_id=` on `GET /api/locations`, and add address text to `get_all.sql`.
   - Add optional `location_id` and `assigned_to_id` to `RefiningOrderCreate`.
6. **Refiner documents per direction** (I1, I7, I8, I9).
   - Add a `direction` column to `refining.documents`, with `renderable` set per row.
   - Seed:
     - sell: `invoice` (rendered), `lot_manifest`, `settlement`
     - buy: `invoice` (imported), `packing_list`
   - Add `DELETE /orders/:id/documents/:kind` (I3).
7. **Combined refiner rows** (D7, J4).
   - For a combined source, `vo` and `settlement_lines.sql` should follow the `combine` edges to the parents' seats, so they return `Combined · 2481-A + 2481-B` and its order reference.
   - Today the join through `orders.lots` makes such a row read `unmatched`.
8. **Settlement line parse** (J1, J2, J5, J7).
   - Add `POST /orders/:id/settlement-lines/parse`. It reads the stored `settlement` PDF and returns invoice lines `{line_reference, weight, unit, purity, fine_oz, suggested_lot_id}` plus our unmatched lots.
   - It writes nothing; Record settlement writes `line_reference`.
   - Rename the API's `unmatched` status, or add a separate line-side status, so the two words do not collide.
   - This is the largest item: a parser per refiner format.
9. **Partial settlement** (section 4, item 1).
   - Either let `DBR/orders/sql/settle.sql` stamp `settled_at` only when every lot is settled, or rule that a first settle closes the order.
   - Jacob decides. Today the confirm text implies partial settlement and the guard forbids it.
10. **A `Completed` rung for a buy order** (section 4, item 11). In `refining_state.sql`, a buy order whose parcel has arrived and whose payout transfer is `Sent` reads `Completed` (`statuses.md:248`).
11. **The pooled-sell total** (G3). `om.total` for a pooled sell is negative dollars with no settlement term. Return the fee as owed cash, and make `total` NULL, or decide the field.
12. **Refiner-lot quantity** (D8). Add `quantity` to `RefiningLotPatch`, or the design makes Qty a display. The design change is the smaller one.
13. **The dead `dispute` action** (H10). Remove `dispute` from `actionsFor`, since Dispute is ruled never. Leave `disputed_at` writable for API use.
14. **Our receiving account on an RS payment** (F3). Verify what `payout_account` holds on a sell order. If it holds nothing, add a `receive_to` block from our own `payments.details`.

**Counts**
- Section 1-2: 94 inventory rows (A 16, B 11, C 2, D 16, E 5, F 7, G 5, H 10, I 9, J 10, K 2, L 1). A row can carry two statuses, so the status counts add up to more than 94: OK 43, GAP 24, WONT 22, COPY 8, MISSING 5.
- Section 3: 19 WON'T WORK items.
- Section 4: 17 MISSING items.
- Section 5: 28 prior items:
  - 16 closed (one of them, §2-3, with a new defect)
  - 7 closed in one place and open in another
  - 1 closed and superseded (§2-2)
  - 3 open
  - 1 superseded
- Section 6: 14 API changes. Items 1 and 2 fix reads that are wrong today; they are not port features.
