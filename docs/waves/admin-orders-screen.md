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
| Shipment card: tracking, ETA, ships from/to | `GET /orders/:orderId/shipments` → **`ShipmentView[]`**, which carries its own decisions: `timeline` is already the Tracker's steps (`stage`, `location`, `scan_time`, `reached`), plus `tracking_status`, `service`, `package` and `actions` | — (this is better than the gap table first assumed - the Tracker needs no second read and no stage list written here) |
| Tracker refresh | `POST /shipping/get_tracking { shipment_id }` → `TrackingScan[]` | — |
| Print Label / Cancel | `ShipmentView.actions.cancel_label`, `.edit_tracking` | — |
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

## What was built

Two routes, one shared card folder, fifteen cards.

```
frontend/app/admin/
  layout.tsx  error.tsx  loading.tsx        the admin gate and its boundaries
  _src_/orders/                             the cards both routes compose
    OrderCard.tsx        the chassis: card chrome, a title row whose left half
                         is the collapse trigger and whose right half holds the
                         badge and the actions, a body that unmounts when closed
    OrderHeaderCard  SpotsCard  LotsCard  RefiningItemsCard  ChargesCard
    PaymentCard  TotalsCard  ProfitBreakdownCard  SettlementCard
    FulfillmentCard  ShipmentCard  ScheduleCards (Pickup/Appointment/Drop-off)
    LinkedFulfillmentCard  DocumentsCard  ChatCard  format.ts
  orders/[id]/     page + error + loading + _src_/AdminOrderScreen.tsx
  refining/[id]/   page + error + loading + _src_/AdminRefiningScreen.tsx
```

**The layout is the frames'**: a 1440 shell at 32 padding, Main flexible and
Aside 400, 24 between every card. A card is `bg-card`, a hairline border, an
8px radius and 16px of padding, which is what every instance in the file
measures.

**The card chassis is page-local on purpose.** Figma's own note says it: *"the
Accordion header has no slot for an instance, so it sits beside it in a Title
row"*. The library `Accordion` draws its own chrome and puts its content inside
its own header column, and the order cards need the badge and the buttons
OUTSIDE the trigger - a button inside a button is not a thing. So `OrderCard`
composes `Button` + `ChevronDown` from the library and supplies the collapse,
the name and the right slot itself, exactly as the Figma component does.

**No library component was added.** Every primitive the six frames use already
exists in `@dorado/components` after the library refresh, and three of them -
`Documents`, `Chat` and `Tracker` - are close enough to the drawing that the
card around them is a dozen lines. `Documents` already ships the ten canonical
names and the Send/Import row actions; `Chat` already ships the
Messages/Calls toggle, the composer and the Call button; `Tracker` already
reads "Pending" for an unscanned stage.

## Card → view mapping

| Card | Reads | Writes |
|---|---|---|
| Order Header | `useOrder` → `OrderView.order/.user/.address/.actions`; `useAdmins` | `usePatchOrder`, `useFinalizeOrder`, `useReopenOrder` |
| Spots | `useOrderSpots`, `useLiveSpots`, `order.spots_locked` | `usePutOrderSpots` (`{ lock }` and `{ set }`) |
| Lots | `OrderView.lots` → `OrderLotView[]` | `useCreateOrderLot`, `usePatchOrderLot`, `useDeleteOrderLot` |
| Refiner items | `RefiningOrderView.lots` → `RefiningLotView[]` | `usePatchRefiningLot`, `useDeleteRefiningLot`, `useAssignRefiningLots` |
| Charges | `OrderView.totals`; `RefiningOrderView.fee/.pool_oz` | — |
| Payment | `usePaymentView`, `OrderView.payout`, `usePayTo`, `useMatchCandidates` | `useOpenPayout`, `useSendPayout`, `useOpenCharge`, `useConfirmMatch` |
| Totals | `OrderView.totals` | — |
| Profit Breakdown | `useProfitBreakdown` → `ProfitBreakdown` | — |
| Settlement | `RefiningOrderView` (state, contents, variance, assay lab) | `useSettleRefiningOrder` |
| Fulfillment | `useOrderFulfillment` → `FulfillmentView`; `useFulfillmentMethods`, `useCarrierServices`, `usePackages`, `useHandoffs` | `useSetFulfillmentMethod`, `usePatchFulfillment`, `useSchedulePickup`, `useScheduleDirect` |
| Shipment / Return | `useOrderShipments` → `ShipmentView[]` (`timeline`, `actions`) | `usePatchShipment`, `useCancelLabel` |
| Pickup / Appointment / Drop-off | `FulfillmentView.pickup/.direct/.fulfillment.status` | `useSetFulfillmentStatus`, `useCancelSchedule` |
| Linked Fulfillment | `RefiningLotView.order_id/.order_number` | — |
| Documents | `useOrderDocuments` → `OrderDocument[]` | — (GAPs 24, 25) |
| Chat | `useCustomerTimeline`, `useConversation`, `useAdminUser` | — (GAP 27) |

**Nothing on these screens computes a number, a state or a label.** A badge is
a `TransferState` or a `RefiningOrderView.state`; a disabled button is an
`actions.*` boolean; which documents exist is `documentsFor`'s answer; whether
Schedule may be pressed is `FulfillmentView.missing` being empty. What the
browser does is format - money, ounces, a purity as a percentage, a timestamp -
and that lives in one file, `format.ts`.

## Hooks added to `@dorado/client`

Eight resource modules came back, one per surface the screens read, each typed
only from `@dorado/contracts` and each naming a route that exists today. The
`keys` table grew the matching namespaces.

| Module | Hooks |
|---|---|
| `orders` | `useOrder`, `useOrderSpots`, `useOrderDocuments`, `useOrderShipments`, `useProfitBreakdown`, `usePatchOrder`, `useFinalizeOrder`, `useReopenOrder`, `useCancelOrder`, `useSupplyOrder`, `useAddFunds`, `usePutOrderSpots`, `useCreateOrderLot`, `usePatchOrderLot`, `useDeleteOrderLot`, `useSplitOrderLot` |
| `refining` | `useRefiningOrder`, `useRefiningLots`, `useRefiners`, `useCreateRefiningOrder`, `usePatchRefiningOrder`, `useSendRefiningOrder`, `useSettleRefiningOrder`, `useAssignRefiningLots`, `usePatchRefiningLot`, `useDeleteRefiningLot` |
| `payments` | `usePaymentView`, `usePayTo`, `usePaymentMethods`, `useMatchCandidates`, `useOpenPayout`, `useSendPayout`, `useMarkPayoutSent`, `useFailPayout`, `useOpenCharge`, `useRequestCharge`, `useRecordWire`, `useConfirmMatch` |
| `fulfillments` | `useOrderFulfillment`, `useFulfillmentMethods`, `useSetFulfillmentMethod`, `useSetFulfillmentStatus`, `useCancelSchedule`, `useSchedulePickup`, `useScheduleDirect`, `usePatchFulfillment` |
| `shipping` | `useCarrierServices`, `usePackages`, `useHandoffs`, `useTracking`, `usePatchShipment`, `useBuyLabel`, `useCancelLabel` |
| `spots` | `useLiveSpots` |
| `users` | `useAdmins`, `useAdminUser` |
| `crm` | `useCustomerTimeline`, `useConversation` |

**Invalidation, and optimistic nothing.** Each module has one private
`use<Resource>Write` wrapper; every mutation goes through it and settles by
invalidating the order's namespace plus whichever sibling read the write moves
(a spot moves every price, a lot moves the totals, a payment moves the order
view). No mutation writes the cache directly, so nothing on screen can claim a
state the API has not confirmed.

**`api/src/shared/http/tests/frontend-routes.test.ts` passes**, which is the
proof that matters here: it walks every route the API declares and every URL
`@dorado/client` names, and reports a call the API cannot answer. Zero.

## Guards moved

| Guard | Was | Is | Why |
|---|---|---|---|
| `lint:client-boundary` frontend floor | 55 | 100 | 111 frontend files, from 75 |
| `lint:client-boundary` client floor | 4 | 20 | 23 client files, from 7 |
| `frontend-routes.test.ts` call floor | 9 | 30 | 32 literal calls, from 10 |
| `playwright.config.ts` `admin` project | deleted | restored | the first authed specs since the nuke; `public` now ignores `app/admin/` |

`shared/tests/roles.ts` is new and is not ceremony: Playwright refuses to let
one test file import another, so `ROLES` and `statePath` could not stay in
`auth.setup.ts` once a second spec needed them.

## Tests

- **136 vitest tests, 7 files.** `_src_/orders/tests/cards.test.tsx` renders
  every card in every state the notes name, from fixtures typed by the
  contracts - a fixture that does not typecheck describes a shape the API
  cannot send. `orders/[id]/_src_/tests/orderScreen.test.tsx` and
  `refining/[id]/_src_/tests/refiningScreen.test.tsx` pin the composition:
  which cards a purchase order draws, which a sales order draws, which swap
  when the fulfillment is booked or the order cancelled, and that a refiner
  order has no Finalize and no Chat.
- **Twelve of those tests are GAP markers**, each named for its gap number, so
  the pass that closes a gap can find the state that was waiting on it.
- **18 Playwright tests, all passing** against a local API from this worktree:
  8 pre-existing, 10 new across the two routes. The order spec seeds a
  disposable order with `seed:e2e:order`; the refining spec reuses the open
  sell draft when there is one, because the API allows a refiner only one and
  answers 409 otherwise.

**Three real defects the e2e run caught that jsdom could not**: the refiner
draft's meta line printed the order number twice (`SO-1063 · SO-1063`, fixed);
the spot assertion had hard-coded "Gold" against an order whose metals the seed
chooses (now read from the API); and the signed-out assertion passed a context
that had inherited the admin session, which is a test that could never fail.
The admin gate itself was fine and is now genuinely proven on both routes.

## States not reachable until the gaps close

Rendered as the API can feed them today, each marked in `cards.test.tsx`:

- **Create fulfillment** (GAP 14) is drawn and permanently disabled with the
  reason on screen. An order that has no fulfillment cannot be given one.
- **Drop-off** (GAP 20) draws its badge and its status buttons from the
  fulfillment row, and its choices panel says the read does not exist.
- **Documents Send and Import** (GAPs 24, 25) are absent rather than inert:
  the card is passed no handler, so `Documents` draws neither action.
- **Send a message** (GAP 27): the Chat composer renders with no send handler.
- **Refiner Charges, Totals and Payment** (GAPs 11, 12) render empty - a
  refining order has neither a transactions row nor a transfer.
- **Refiner Documents** (GAP 26) renders an empty card.
- **Lot search** (GAP 10) draws the Autocomplete and Add to Order, disabled.
- **Settlement's expected figure** (GAP 13) shows the expected DATE, because
  the view carries ounces and a date and no money.
- **Pickup Office, Pickup/Appointment Driver** (GAPs 17, 18) are dashes.
- **Orders to date** (GAP 2) drops its line entirely rather than showing zero.
- **Cancel Order** (GAP 3, and GAP 5 on the refiner side) is drawn disabled
  with the reason, because the route wants a return service and a package the
  header has nowhere to ask for.
- **Batch** (GAP 8) is wired to a no-op: the two-call sequence it would need is
  not transactional, and half of it failing leaves an empty refining order.

Every other state in the six frames is live against the API as it stands.
