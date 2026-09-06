# The admin order screens (ruling 100)

Jacob: *"lets try our hand at building the admin orders screen with all it's
states and such."*

Two routes, six Figma frames, fourteen cards. `app/admin/orders/[id]` is the
customer order — a purchase order (we buy scrap) or a sales order (we sell
bullion). `app/admin/refining/[id]` is the refiner order — a refiner sales
order (we sell lots), a refiner purchase order (we buy bullion), and both of
their drafts. The spec text is `docs/design/orders-notes-2026-09-05.md`
sections 3 and 4 plus every component description in the Figma file
`ymmNlCDLVIfanpRQ7QHMIs`, page `0:1`.

**The API does not change in this lane (ruling 44).** Where a card needs a fact
the API does not give, the card renders the state the API can feed and the gap
is written down below with the exact field or route wanted. Jacob runs an API
lane from that table.

## Step 0 — the API gap inventory

One row per card per state. "Feeds" names the `@dorado/contracts` view field or
the route; "GAP" names what does not exist. Routes are relative to `/api`.

### Order Header — `Audience=Admin`, `State=Active/Cancelled`, `Party=Customer/Refiner`

| Element | Feeds | Gap |
|---|---|---|
| Eyebrow PURCHASE ORDER / SALES ORDER | `OrderView.order.direction` | — |
| Customer name | `OrderView.user.name` (`UserSummary`) | — |
| `PO-2481 · Austin, TX` | `order.number`; `OrderView.address.city/state` | **GAP 1** — the `PO-`/`SO-` prefix is composed in the browser. Want `OrderView.reference` (`"PO-2481"`), so no label is decided here (ruling 83). |
| `7 orders to date` | — | **GAP 2** — no count anywhere. Want `OrderView.user.orders_to_date` (int). |
| Cancelled badge | `order.status` (a pure label, ruling 2) | — |
| Assigned-to Select | `order.assigned_to_id`; options `GET /users/admins` → `AdminUser[]` | — |
| Assigned-to write | `PATCH /orders/:id` → `OrderPatch.assigned_to_id` | — |
| Cancel Order | `actions.cancel`; `POST /orders/:id/cancel` | **GAP 3** — the route needs `OrderCancelBody { carrier_service_id, package_id }` and the Figma header is a bare button. Want the body optional, with the server choosing the default return service and package (ruling 76). |
| Finalize | `actions.finalize`, `actions.finalize_blocked_by`; `POST /orders/:id/finalize` | — (the blocked-by array is exactly the tooltip the Figma gate wants) |
| Reopen Order | `actions.reopen`; `POST /orders/:id/reopen` | — |
| `Party=Refiner`: Refiner Select | `RefiningOrderView.refiner` (`RefinerView`); options `GET /refiners/get_all`; write `PATCH /refining/orders/:id` | — |
| `Party=Refiner`: Location Select (refinery office) | — | **GAP 4** — `refining.orders` has no location column and `places.locations` has no route. Want `RefiningOrder.location_id` + `GET /locations`. |
| `Party=Refiner`: Send to Refiner | `POST /refining/orders/:id/send`; `RefiningOrder.sent_at` | — |
| `Party=Refiner`: Cancel Order | — | **GAP 5** — no cancel route for a refining order. Want `POST /refining/orders/:id/cancel`. |
| `Party=Refiner`: orders to date | — | GAP 2 again, on the refiner's organization. |

### Order Spots — `Spots=Unlocked/Locked`, finalized

| Element | Feeds | Gap |
|---|---|---|
| Four frozen prices | `GET /orders/:id/spots` → `OrderSpot[]` (`bid`, `ask`, `metal_id`) | — (**note**: `OrderView` does NOT carry spots; this is its own read, ruling 9) |
| Unlocked = live market | `GET /spots` → the live rows | — |
| Locked flag | `order.spots_locked` | — |
| Lock / Unlock | `PUT /orders/:id/spots { lock }` | — |
| Edit a bid | `PUT /orders/:id/spots { set: [{ metal_id, bid }] }` | — |
| Unlock **disabled** once finalized | — | **GAP 6** — `OrderActions` has no `lock_spots`/`unlock_spots`. Derived here from `actions.finalize === false && actions.reopen === false`, which is a guess. Want the two booleans on `OrderActions`. |
| Refiner orders: always locked, no button | — | **GAP 7** — refiner spots have a contract (`refiners/spots.ts`) and no route. Want `GET /refining/orders/:id/spots`. |
| Collapsed summary `Gold $2,411.20` | same rows | — |

### Lots / Items — `Kind=Scrap/Bullion`, selection, batching

| Element | Feeds | Gap |
|---|---|---|
| Rows | `OrderView.lots` → `OrderLotView[]` (`lot: LotView`, `premium`, `price`, `payable`, `line_total`, `settled`, `refining_order_number`) | — |
| Item name + `Lot 2481-A` link | `lot.product_name` / `lot.form`; `lot.reference` | — |
| Qty · Pre Melt · Post Melt · Purity · Premium | `lot.quantity`, `lot.pre_melt`, `lot.post_melt`, `lot.purity`, `premium` | — (purity renders ×100 as a percentage; that is formatting, not a decision) |
| Price, last column | `line_total` | — |
| Edit a cell | `PATCH /orders/lots/:id` → `OrderLotPatch` (money and physical facts in one patch) | — |
| Delete | `DELETE /orders/lots/:id` | — |
| New | `POST /orders/:id/lots` → `OrderLotPatch` | — |
| Split | `POST /orders/lots/:id/split` → `LotSplit` | — |
| Batch selected → refiner order | `POST /refining/orders` then `POST /refining/orders/:id/lots { lot_ids }` | **GAP 8** — two calls with no transaction between them; a failure after the first leaves an empty refining order. Want `POST /refining/orders { refiner_id, direction, lot_ids }`. |
| Create Sale (purchase order) | — | **GAP 9** — `POST /orders/:id/supply { refiner_id }` exists but it supplies a **sales** order from a refiner. Nothing wraps a finalized purchase order into a sale. |
| Create Purchase Order (customer sales order) | `POST /orders/:id/supply { refiner_id }` | — |
| Adding Lot — lot search Autocomplete | — | **GAP 10** — no lot search. Want `GET /lots?q=&unassigned=true` → `LotView[]`. |
| Refiner table (Item · Lot · Weight · Purity · Premium · Value) | `RefiningOrderView.lots` → `RefiningLotView[]` | — |
| Refiner row edit / delete | `PATCH /refining/lots/:id` → `RefiningLotPatch`; `DELETE /refining/lots/:id` | — |
| Refiner Add Lot | `POST /refining/orders/:id/lots { lot_ids }` | — |
| Refiner row: source order `PO-2493` | `RefiningLotView.order_number`, `order_direction` | — (same prefix problem as GAP 1) |

### Charges — `Show shipping`, `Show pool oz`

| Element | Feeds | Gap |
|---|---|---|
| Payout / Payment Charge | `OrderView.totals.payout_fee`, `.surcharge`, `.waive_payout_fee` | — |
| Shipping Charge | `totals.shipping`, `.shipping_fee_actual`, `.waive_shipping_fee` | — |
| Pool Oz Remediated (customer order) | `totals.pool_oz_deducted`, `.pool_remediation` | — |
| Refiner fee | `totals.refiner_fee`; refiner side `RefiningOrder.fee` | — |
| Pool Oz Remediated (refiner SO) | `RefiningOrderView.pool_oz`, `.pool` → `PoolBalance[]` | — |
| Refiner order charges as a card | — | **GAP 11** — a refining order has no `orders.transactions` row, so there is no Charges/Totals source. Want `RefiningOrderView.totals` (fee, pool remediation, payment charge, total). |

### Payment — six states, Pay to, Matching

| Element | Feeds | Gap |
|---|---|---|
| State badge (Not sent / Processing / Sent / Due / Processing / Received) | `GET /payments/view/:orderId` → `PaymentView.state` (`TransferState`), `.kind` | — |
| Amount / Amount due | `PaymentView.amount`, `.amount_due` | — |
| Account name · Bank · Account type · Routing •••• · Account •••• | `OrderView.payout` → `OrderViewPayout` (`account_holder_name`, `bank_name`, `account_type`, `routing_last4`, `account_last4`) | — |
| Method Select | `PaymentView.rail` (`Rail`); options `GET /payments/methods` | — |
| Pay to Select | `GET /payments/payouts/pay_to?user_id=` → `PayTo[]`; `PaymentView.pay_to` | — |
| Send payment | `POST /payments/payouts` (open) then `POST /payments/payouts/:id/send` | — |
| Send **disabled** until finalized | `OrderView.actions.finalize_blocked_by` | — |
| Mark sent (wire) | `POST /payments/payouts/:id/mark_sent { reference }` | — |
| Request payment | `POST /payments/charges` then `POST /payments/charges/:id/request { bank_link_id }` | — |
| Matching Autocomplete | `GET /payments/inbound/candidates?order_id=` → `MatchCandidate[]` (`rung`, `amount_delta`, date, counterparty, memo) | — |
| Confirm match | `POST /payments/inbound/:id/match { order_id }` | — |
| Refiner order payment | — | **GAP 12** — `payments.transfers.order_id` points at `orders.orders`; a refining order has no row there, so no `PaymentView` and no payout can be opened for a refiner. Want `GET /refining/orders/:id/payment` and a transfer that can key on a refining order. |

### Totals

| Element | Feeds | Gap |
|---|---|---|
| Items · Shipping · Surcharge · Sales tax · Credit | `OrderView.totals` (`items`, `shipping`, `surcharge`, `sales_tax`, `funds`) | — |
| Total payout / Total payment / Total due | `totals.total`, `.post_charges_amount` | — |
| Refiner order totals | — | GAP 11. |

### Profit Breakdown

| Element | Feeds | Gap |
|---|---|---|
| Per-party, per-metal shares | `POST /quotes/profit_breakdown { order_id }` → `ProfitBreakdown.shares` (`ProfitShare[]`) | — |
| Party totals | `ProfitBreakdown.parties` (`ProfitPartyTotal[]`) | — |
| Collapsed: profit only | `parties[party='dorado'].total_profit` | — |

### Settlement (refiner SO, in Profit Breakdown's slot)

| Element | Feeds | Gap |
|---|---|---|
| Badge Pending assay / Settled / Disputed | `RefiningOrderView.state` | — |
| Estimated fine oz | `RefiningOrderView.estimated_content` | — |
| Settled fine oz · Variance | `.settled_content`, `.variance` | — |
| Assay lab | `RefiningOrder.assay_lab` | — |
| Expected settlement (the big $) | `RefiningOrder.expected_settlement_on` is a DATE | **GAP 13** — the figure is money and the view has ounces. Want `RefiningOrderView.expected_settlement` (numeric). |
| Settle | `POST /refining/orders/:id/settle` → `RefiningSettlement` | — |

### Fulfillment family

| Element | Feeds | Gap |
|---|---|---|
| The card's own read | `GET /orders/:orderId/fulfillments` → `FulfillmentView` (`fulfillment`, `method`, `pickup`, `direct`, `shipments`, `parcel`, `scheduled_at`, `missing`, `actions`) | — |
| Empty · Not set | `FulfillmentView` absent, or `method` unset | — |
| **Create fulfillment** button | `POST /fulfillments` → `FulfillmentCreateBody { checkout_id }` | **GAP 14** — create takes a **checkout** id. An order that has no fulfillment cannot get one. Want `POST /fulfillments { order_id }`. |
| Five methods | `GET /fulfillments/methods?direction=` → `FulfillmentMethodRead[]`, `category` in `SHIPMENT/PICKUP/DIRECT/DROPOFF` | — |
| Set method | `POST /fulfillments/set_method` | — |
| Shipment choices (Service · Package · Handoff · Ship to · Ship from) | `PATCH /fulfillments/:id { shipment: … }`; options `GET /carrier_services/offered`, `GET /shipping/packages`, `GET /shipping/handoffs`, `GET /addresses` | — |
| Declared value | `Shipment.declared_value` (server's, ruling 58) | — display only |
| Coverage / Additional coverage | — | **GAP 15** — `FulfillmentShipmentChoices` has no insurance field. Want `insured` and `additional_coverage` on it. |
| Return: "Bill return shipping to the customer" | — | **GAP 16** — no field. Want `bill_return_to_customer` on the return choices. |
| Pickup: Window · Pickup address | `FulfillmentView.pickup.start_time/end_time`, `.pickup_address_id`; `POST /fulfillments/schedule_pickup` | — |
| Pickup: Office | — | **GAP 17** — pickups carry no location. Want `location_id` on `fulfillments.pickups`, plus `GET /locations`. |
| Pickup / Appointment: Driver, With | `pickup.assigned_employee_id`, `direct.assigned_employee_id` | **GAP 18** — an id with no name and no list route. Want `GET /employees` → name + id, or the employee nested on the view. |
| Appointment: Date · Office · Time | `FulfillmentView.direct` (`is_appointment`, `location_id`, `start_time`); `POST /fulfillments/schedule_direct` | GAP 17 (the office name). |
| Cancel · Reschedule | `POST /fulfillments/cancel_schedule`; re-`PATCH` then re-schedule | — |
| Check In / Mark Complete / Headed to Pickup / Mark Picked Up | `POST /fulfillments/set_status { fulfillment_id, status }` | **GAP 19** — `Fulfillment.status` is a free `z.string()`. The six operator transitions in the notes are not a contract enum, so the button labels are decided in the browser. Want `FulfillmentStatus` as an enum, and `FulfillmentActions` to say which transitions are open. |
| **Drop-off** (Driver · Refinery · Window, Headed to Refinery / Mark Dropped Off) | `fulfillments.dropoffs` table + `FulfillmentDropoff` contract | **GAP 20** — the whole method: no repo read on the view, no `dropoff` arm on `FulfillmentPatchBody`, no `schedule_dropoff` route. The card renders read-only from `method.category === 'DROPOFF'` and nothing else. |
| Shipment card: tracking, ETA, ships from/to | `OrderView.shipments` → `OrderViewShipmentDetail` (`tracking_number`, `shipping_status`, `est_delivery`, `shipped_at`, `delivered_at`, `service_name`, `package_label`) | — |
| Tracker scans | `POST /shipping/get_tracking { shipment_id }` → `TrackingScan[]` | — |
| Print Label | `OrderViewShipmentDetail.label` (admin only) | — |
| Cancel Shipment | `POST /shipping/cancel_label { shipment_id }` | — |
| Awaiting Tracking: Tracking # + Save | `PATCH /shipments/:id { tracking_number }` | — |
| Awaiting Tracking: **Carrier select** | — | **GAP 21** — `ShipmentPatch` deliberately carries no carrier, and nothing sets `carrier_service_id` after the fact. Want it on the patch, or the select goes. |
| Return Shipment (Label Created / In Transit / Returned) | `OrderView.shipments` where `direction === 'Return'` | — (the return label is minted by `POST /orders/:id/cancel`; there is no other way to make one, which is fine) |
| **Linked Fulfillment** (drop ship → `SO-1112`) | — | **GAP 22** — nothing joins a refiner purchase order to the customer sales order whose parcel it drop-ships. `RefiningLotView.order_number` links a **lot**, not a fulfillment. Want `linked_order` on the fulfillment view. |

### Documents

| Element | Feeds | Gap |
|---|---|---|
| Rows by method | `GET /orders/:id/documents` → `OrderDocument[]` (`kind`, `name`, `available`) | — (the by-category table is already the server's: `orders/rules.ts` `documentsFor`) |
| Invoice unavailable until finalized | `OrderDocument.available` | — |
| Download / generate | `POST /pdf/generate_invoice`, `generate_sales_order_invoice`, `generate_packing_list`, `generate_return_packing_list` | **GAP 23** — four of the ten canonical kinds have a generator. Shipping Instructions, Pickup Manifest, Pickup Instructions, Intake Receipt, Appointment Instructions, Settlement and Lot Manifest have none. |
| **Send** on an available row | — | **GAP 24** — no route sends a document. Want `POST /orders/:id/documents/:kind/send`. |
| **Import** on an unavailable row | — | **GAP 25** — no upload. Want `POST /orders/:id/documents/:kind` (multipart), which is also how the refiner's Settlement statement arrives. |
| Refiner order documents | — | **GAP 26** — `documentsFor` is keyed on an order's fulfillment category. Want `GET /refining/orders/:id/documents`. |

### Chat

| Element | Feeds | Gap |
|---|---|---|
| Timeline (View=Calls, and the mixed log) | `GET /customers/:id/timeline` → `CustomerTimeline[]` (`kind`, `at`, `direction`, `summary`, `status`) | — |
| Messages view, full bodies | `GET /sms?user_id=` → `SmsMessage[]` (`body`, `direction`, `status`, `media`) | — |
| Phone number under the title | `GET /users/:id` → `AdminUser.phone_number` | — |
| Call button | `POST /calls/token` → `CallToken` (softphone) | — |
| **Send a message** | — | **GAP 27** — the composer has no route. Want `POST /sms { user_id, body }`. |
| **Attach (MMS)** | — | **GAP 28** — no media upload on the send path. |
| Call Event rows (Outgoing / No answer / Incoming / Missed) | `CustomerTimeline` where `kind === 'call'`; one call by id `GET /calls/:id` | **GAP 29** — the timeline's `status` is text and the four Figma call kinds are not an enum on it. Rendered from `direction` + `status` strings. |

### Summary

**Twenty-nine gaps.** Nine of them stop a whole card or a whole state from
being reachable: GAP 12 (refiner payment), GAP 14 (create a fulfillment for an
order), GAP 20 (drop-off), GAP 22 (linked fulfillment), GAP 24/25 (document
send and import), GAP 27 (send a message), GAP 11 (refiner charges and
totals), GAP 5 (cancel a refiner order). The rest degrade a card without
blocking it.

Everything else in the six frames is fed by a view that exists today.

<!-- SECTIONS BELOW ARE FILLED IN AS THE BUILD LANDS -->

## Card → view mapping

## Hooks added to `@dorado/client`

## Library components added

## States not reachable until the gaps close
