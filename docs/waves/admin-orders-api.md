# The admin order screens' API (ruling 100, Step 0's table closed)

`docs/waves/admin-orders-screen-gaps.md` is Step 0: twenty-nine gaps, one row
per card per state, each naming the exact field or route wanted. This is what
the API lane did about them. **Twenty-eight are closed. One is left, and it is
left because its design does not exist yet.**

Nothing in `frontend/` or `packages/client` was touched: the screen lane wires
these routes in its second pass, from the table at the bottom.

## Per gap

| GAP | What it wanted | Closed with | Its test |
|---|---|---|---|
| 1 | `OrderView.reference` | `reference` on the view, built in `db/orders/sql/view.sql` as `'PO-'`/`'SO-' \|\| number` | `orders/tests/screens.test.ts` "the header reads PO-/SO- off the server" |
| 2 | `orders_to_date` | `OrderView.user.orders_to_date` (a count in the same read); `RefiningOrderView.orders_to_date` for the refiner header | same test; `refining/tests/screens.test.ts` "the Charges, Totals and Settlement figures" |
| 3 | `OrderCancelBody` optional | every field optional plus `bill_return_to_customer`; the server reads the default return service and box (`shipping/services/sql/default_return.sql`, `shipping/packages/sql/default_return.sql`) | `orders/tests/screens.test.ts` "Cancel with no body picks the default return service and box" |
| 4 | `RefiningOrder.location_id` + `GET /locations` | column (168) on `RefiningOrderPatch`; `GET /api/locations` -> `Location[]` | `refining/tests/screens.test.ts` "a refiner order carries an office"; `accounts/employees/tests/endpoints.test.ts` |
| 5 | `POST /refining/orders/:id/cancel` | `cancelled_at` (168), the route, and the lots are RELEASED so they can be batched again; the open-sell index now excludes a cancelled order | `refining/tests/screens.test.ts` "cancelling releases the lots" |
| 6 | `OrderActions.lock_spots` / `unlock_spots` | both booleans, off `rules.isFinalized` (spots locked AND a total written) rather than the guess the card was making | `orders/tests/screens.test.ts` "lock_spots and unlock_spots are answered" |
| 7 | `GET /refining/orders/:id/spots` | one row per metal on the order: the pool's last lock for that refiner and metal, falling back to the live bid, with `locked` saying which | `refining/tests/screens.test.ts` "the spots read answers a row per metal" |
| 8 | atomic `POST /refining/orders { …, lot_ids }` | `RefiningOrderCreate.lot_ids`; create and assign are one transaction | `refining/tests/screens.test.ts` "a batch creates the order and assigns its lots in one call" |
| 9 | Create Sale | `POST /api/orders/:id/refining-sale { refiner_id }` - a finalized purchase order's lots onto the refiner's one open SELL order (it pools rather than opening a second) | `refining/tests/screens.test.ts` "Create Sale wraps a finalized purchase order" |
| 10 | lot search | `GET /api/lots?q=&unassigned=true` -> `LotView[]`, mounted at `/api/lots` because a lot search holds no order id | `orders/tests/screens.test.ts` "the lot search finds a lot by its order number" |
| 11 | `RefiningOrderView.totals` | `{ fee, pool_remediation, payment_charge, total }`, defined once in the `refining.order_money` view (169) | `refining/tests/screens.test.ts` "the Charges, Totals and Settlement figures" |
| 12 | refiner payment | `payments.transfers.refining_order_id` + a CHECK that exactly one order key is set (168); `GET /api/refining/orders/:id/payment` -> `PaymentView`; `POST /api/payments/payouts` and `/charges` take either key | `refining/tests/screens.test.ts` "a refiner order has a Payment card of its own" |
| 13 | `expected_settlement` as money | on the view, from `refining.order_money`: the ounces the refiner owes (content x premium) valued at the refiner's own feed | same test |
| 14 | `POST /fulfillments { order_id }` | `FulfillmentCreateBody` takes exactly one of `checkout_id`, `order_id`, `refining_order_id` | `logistics/fulfillments/tests/dropoff.test.ts` "an order with no fulfillment gets one" |
| 15 | coverage | `insured` and `additional_coverage` on `FulfillmentShipmentChoices` (column in 168) | `dropoff.test.ts` "the shipment choices carry cover and who pays the return" |
| 16 | bill the return | `bill_return_to_customer` on the shipment choices and on `OrderCancelBody` | same test, and `screens.test.ts` "the return leg records who pays for it" |
| 17 | pickup office | `fulfillments.pickups.location_id` (168), on `FulfillmentPickupChoices` | `dropoff.test.ts` "a pickup offers its two moves in order" |
| 18 | `GET /employees` | `EmployeeSummary` (id, user_id, role, enabled, name) from `auth.employees` joined to `auth.users` | `accounts/employees/tests/endpoints.test.ts` |
| 19 | `FulfillmentStatus` + open transitions | a Postgres enum (168) so the generated contract is an enum, and `FulfillmentActions.transitions` naming the open operator moves per kind | `dropoff.test.ts` "walks its two states" and "a pickup offers its two moves in order" |
| 20 | Drop-off end to end | `db/fulfillments/dropoffs/**`, a `dropoff` arm on the view and on `FulfillmentPatchBody`, `POST /api/fulfillments/schedule_dropoff`, `GET /api/orders/:orderId/dropoffs`, and the two timestamps stamped by the status moves | `dropoff.test.ts` "a refiner order takes a Drop-off" |
| 21 | carrier on `ShipmentPatch` | `carrier_service_id`, refused once the parcel has a label or a tracking number | `dropoff.test.ts` "an awaiting-tracking parcel takes a carrier" |
| 22 | `linked_order` | on `FulfillmentViewFacts`: the customer order a refiner parcel drop-ships to, joined through the lot in `db/fulfillments/sql/view.sql` | `dropoff.test.ts` "a drop-shipped refiner parcel names the customer order it fills" |
| 23 | six document renderers | **LEFT.** See below. | — |
| 24 | Send a document | `POST /api/orders/:id/documents/:kind/send`, through `emails.sendDocument` | `orders/tests/screens.test.ts` "a document with no renderer is unavailable until one is imported" |
| 25 | Import a document | `POST /api/orders/:id/documents/:kind` (multipart), and `POST /api/refining/orders/:id/documents/:kind` for the refiner's settlement statement | same test; `refining/tests/screens.test.ts` "a refiner order names its documents" |
| 26 | refiner documents | `GET /api/refining/orders/:id/documents` | same |
| 27 | send a message | `POST /api/sms { user_id, body }` - the number is read server-side from the customer's row | `crm/sms/tests/send.test.ts` |
| 28 | MMS | `media` on the same body, carried through the provider and stored on the row | same test |
| 29 | call kinds | `CallKind` (`Outgoing` / `No answer` / `Incoming` / `Missed`) and `CustomerTimeline.call_kind`, paired from direction and status in SQL | `crm/sms/tests/send.test.ts` "the timeline names each call as one of the four kinds" |

## GAP 23, and why it is left

**The Figma "Media" file (`WkbKhVaAYmxKTsbmAQEwmk`) has ONE page, `0:1`
"Mailers". There is no Documents page.** `get_metadata` was asked for the
document's top-level pages on 2026-09-06 and listed exactly that one. The design
notes' section 5 describes a Documents page - Pickup Manifest, Intake Receipt,
Instructions · Pickup, Instructions · Appointment - but it is not in the file
this lane can read, so ruling 95 is not satisfied for any of the six and none
was built.

What the lane did instead is make the Documents card HONEST about it.
`orders/rules.ts` now knows which kinds have a renderer (`invoice`,
`packing_list`, `return_packing_list`, `sales_order_invoice`); the other six -
Shipping Instructions, Pickup Manifest, Pickup Instructions, Intake Receipt,
Appointment Instructions, Lot Manifest - and Settlement are `available: false`
until a file is IMPORTED for them, which is exactly the card's Send/Import
split. An imported row carries its `pdf_id` and Send works on it from then on.

Building the six is a documents lane, and it starts the day the Media file has
a Documents page.

## Migrations

| # | what |
|---|---|
| 168 | `the_screens_ask_for_columns` - `refining.orders.location_id` + `cancelled_at` (and the open-sell index excludes a cancelled order), `fulfillments.pickups.location_id`, `shipping.shipments.additional_coverage` + `bill_return_to_customer`, `payments.transfers.refining_order_id` (order_id becomes nullable, one-key CHECK, its own live-movement index), `media.pdfs.refining_order_id`, and `fulfillments.fulfillment_status` as an enum |
| 169 | `a_refiner_orders_money_has_one_definition` - the `refining.order_money` view: expected settlement, fee, pool remediation, payment charge and total, defined once for the order view, the order list and the Payment card |
| 170 | `a_driver_is_an_employee` - `fulfillments.dropoffs.driver_employee_id` re-pointed at `auth.employees`, where its two siblings already point. 166 had it at `auth.users`, so the screens' one Driver select would have needed two different ids |

All three are additive (170 re-points a key on an empty table). `exchange` is
neither read nor written by any of them; `lint:migrations` is green. Genesis and
the contracts are regenerated from dev.

**One applied migration was edited, and it had to be.** `052_backfill_fulfillments.sql`
inserts `'COMPLETED'`/`'PENDING'` into `fulfillments.fulfillments.status`, which
168 makes an enum, so the cast `::fulfillments.fulfillment_status` is now on that
INSERT. Nothing about the rows it writes changes; what changes is that the
migration still runs against a schema built from genesis, which is what
`verify:backfill` replays and what production day replays (ruling 82). Without
it the whole chain stops at 052 with a 42804.

## Wire shapes that moved, for the screen lane

- `OrderView` gains `reference` and `actions.lock_spots` / `unlock_spots`;
  `OrderView.user` gains `orders_to_date`.
- `OrderDocument` gains `pdf_id`, and `available` is now false for a kind with
  no renderer and no imported file.
- `OrderCancelBody` is fully optional and gains `bill_return_to_customer`.
- `RefiningOrderView` gains `totals`, `expected_settlement`, `orders_to_date`,
  `location_id` and `cancelled_at`; its `state` gains `Cancelled`.
  `RefiningLotView` gains `order_reference`.
- `RefiningOrderCreate` gains optional `lot_ids`; `RefiningOrderPatch` gains
  `location_id`.
- `FulfillmentViewFacts` gains `dropoff` and `linked_order`;
  `FulfillmentActions` gains `transitions`; `Fulfillment.status` is the
  `FulfillmentStatus` enum; `FulfillmentPatchBody` gains a `dropoff` arm;
  `FulfillmentCreateBody` takes one of three keys; `FulfillmentStep` gains
  `refiner_id`.
- `FulfillmentShipmentChoices` gains `insured`, `additional_coverage`,
  `bill_return_to_customer`; `FulfillmentPickupChoices` gains `location_id` and
  `assigned_employee_id`; `FulfillmentDirectChoices` gains
  `assigned_employee_id`.
- `ShipmentPatch` gains `carrier_service_id`.
- `PaymentView.order_id` is nullable and it gains `refining_order_id`; its
  `direction` carries either vocabulary. `OpenPayoutBody` / `OpenChargeBody`
  take `order_id` or `refining_order_id`.
- `CustomerTimeline` gains `call_kind`. New: `SmsSendBody`, `EmployeeSummary`,
  `RefiningTotals`, `RefiningSpot`, `LinkedOrder`, `StoredDocument`,
  `OrderViewUser`, `CallKind`, `FulfillmentDropoffChoices`,
  `FulfillmentScheduleDropoffBody`.

## Routes the screen lane must wire

| method | path | answers |
|---|---|---|
| GET | `/api/lots?q=&unassigned=` | `LotView[]` |
| GET | `/api/locations` | `Location[]` |
| GET | `/api/employees` | `EmployeeSummary[]` |
| POST | `/api/orders/:id/refining-sale` | 201 `RefiningOrderView` |
| POST | `/api/orders/:id/documents/:kind/send` | `OrderDocument` |
| POST | `/api/orders/:id/documents/:kind` | 201 `OrderDocument` (multipart) |
| GET | `/api/orders/:orderId/dropoffs` | `FulfillmentDropoff[]` |
| POST | `/api/refining/orders/:id/cancel` | `RefiningOrderView` |
| GET | `/api/refining/orders/:id/spots` | `RefiningSpot[]` |
| GET | `/api/refining/orders/:id/payment` | `PaymentView` |
| GET | `/api/refining/orders/:id/documents` | `OrderDocument[]` |
| POST | `/api/refining/orders/:id/documents/:kind` | 201 `OrderDocument` (multipart) |
| POST | `/api/fulfillments/schedule_dropoff` | `FulfillmentView` |
| POST | `/api/sms` | 201 `SmsMessage` |

All fourteen are admin-only and listed in
`accounts/authorization/admin-routes.json`.

## The gate

`pnpm check` reads `CHECK_EXIT=0`, all 44 members, 301s wall clock. That
includes `verify:genesis` (the whole schema rebuilt from `000_genesis_schema.sql`
and compared to dev, the `refining.order_money` view included),
`verify:backfill`, `validate:wire`, `audit:query-paths` and `audit:constraints`
against the four new columns and their indexes.

## What is still open

- **GAP 23's six renderers**, waiting on a Figma Documents page.
- **Send on a refiner order** is deliberately absent: a refiner is not a
  customer and email is manual (ruling 15). The card imports; it does not send.
- **`payment_charge`** is the flat fee of the `payments.methods` row matching
  the transfer's rail (a wire is $20, an ACH nothing). If a refiner order ever
  needs a fee the customer methods do not describe, that is a column on
  `refining.orders`, not a branch in the view.
- **Sending an imported document cannot be exercised in a test run**: object
  storage refuses to be read during one, so the send path is tested through its
  refusal and the availability flip, and the render path stays covered by
  `documents/pdfs/tests/replay.test.ts`.
