# Views are SQL, decisions are added once (rulings 71 and 73)

Jacob, 2026-09-04, on `domain/fulfillments/compose.ts`'s literal return: *"This
type of return just pisses me off. like, fucking WHY"* - and on
`attachForCheckout({ … }: { … })`: *"Do you not realize how hard this makes shit
to read and follow? We need to be able to pass in exact types to functions. Not
this horseshit."*

Three things came out of that, and they are one idea seen from three sides.

## 1. A view is one SQL read

Every composed read the API serves is now assembled by ONE `.sql` file under the
owning feature's `db/**/sql/`, with `to_jsonb` / `jsonb_build_object` /
`jsonb_agg` nesting each child **by its table**. The repo returns
`Contract.parse(row)`. **Nothing in TypeScript names a field of a view any
more** - the contract is the shape, and zod strips whatever the projection grew
that no contract declares.

| view | SQL | repo |
| --- | --- | --- |
| `OrderViewFacts` -> `OrderView` | `db/orders/sql/view.sql` | `db/orders/repo.ts` `view(id)` |
| `OrderRead` (list + one) | `db/orders/sql/list.sql`, `get_one.sql` | `list`, `getOne` - totals nested, not grafted |
| `FulfillmentViewFacts` -> `FulfillmentView` | `db/fulfillments/sql/view.sql` | `db/fulfillments/repo.ts` `view(ids, order_id, scheduled, from, to, employee_id)` |
| `ShipmentViewFacts` -> `ShipmentView` | `db/shipping/shipments/sql/view.sql` | `db/shipping/shipments/repo.ts` `view(id, order_id)` |
| `CheckoutViewFacts` -> `CheckoutView` | `db/checkout/checkouts/sql/view.sql` | `db/checkout/checkouts/repo.ts` `view(id)` |
| `AddressBookEntryFacts` -> `AddressBookEntry` | `db/places/user-addresses/sql/view.sql` | `db/places/user-addresses/repo.ts` `view(user_id, address_id)` |
| `ComposedCarrier` | `db/shipping/carriers/sql/view.sql` | `db/shipping/carriers/repo.ts` `view(id)` |
| `BullionStorefront` | `db/products/sql/list.sql` | `db/products/repo.ts` `listFor` - already one read, now parsed |

**Timestamps are cast, not left to the driver.** `to_jsonb(timestamptz)` renders
in the SESSION's timezone (dev's is `America/Chicago`), while pg's own parser
hands back a `Date` that `JSON.stringify` prints as `...Z`. A view that nested
the raw value would put two different spellings of the same instant on one wire.
Every timestamp inside a view is therefore
`to_char(x AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`, which is
exactly `Date.toISOString()` - and is what makes `Contract.parse` (whose columns
are `z.string()`) possible at all.

**Composers deleted:** `domain/fulfillments/compose.ts` (compose, composeAll,
byFulfillment, groupByFulfillment, and `detailsFor`'s seven-map bundle),
`domain/shipping/carriers/compose.ts`, `domain/orders/read.ts`'s `attach` and
`withProduct`, `domain/checkout/service.ts`'s `compose`,
`domain/shipping/shipments/view.ts`'s `composeOne`,
`domain/places/addresses/rules.ts`'s `entry` and `byDefaultThenRecipient`
(the sort is the view's `ORDER BY` now), and `rules.byStartTimeThenId` (the
schedule's order is the view's `ORDER BY` too).

**Two reads died with them.** `fulfillments/pickups` and `fulfillments/directs`
each had a `getScheduled` whose only caller was `composeAll`; the schedule is one
filter on the fulfillment view now, so both functions and both `get_scheduled.sql`
files are gone.

**`payableOf` and `lineTotalOf` are SQL.** They were arithmetic over an order
line's own columns, so they are `CASE` expressions inside `orders/sql/view.sql`
and no longer exist in `domain/orders/rules.ts`.
`domain/orders/tests/rules.test.ts` now asserts the SQL, which is where the one
definition lives.

## 2. Decisions are added once

`api/shared/views.ts` holds `withDecisions(view, decisions)` - a typed
`Object.assign` - and `withEachDecision(views, decide)` for a list. **It is the
only `Object.assign` in the codebase**; the lint below fails any other.

| view | decisions | computed by |
| --- | --- | --- |
| `OrderView` | `actions` | `domain/orders/rules.ts` `actionsFor(view)` |
| `FulfillmentView` | `missing`, `actions` | `domain/fulfillments/rules.ts` `decisionsFor(view, handoffs)` |
| `ShipmentView` | `tracking_status`, `timeline`, `actions` | `domain/shipping/rules.ts` `shipmentDecisions(view, isAdmin)` |
| `CheckoutView` | `missing` | `domain/checkout/rules.ts` `checkoutState(view, handover)` |
| `AddressBookEntry` | `actions` | `domain/places/addresses/rules.ts` `actionsFor(view)` |
| `PayoutDetails` | the opened envelopes | `domain/payouts/service.ts` via `withDecisions` |
| `Image & { url }` | `url` | `domain/media/images/service.ts` via `withDecisions` |

Every rule now takes **the parsed view** and reads its own columns, instead of a
hand-assembled `Facts` bag. `OrderActions.cancel` is `view.address !== null`,
not `hasAddress`; `add_funds` is `view.totals?.total != null`, not `hasTotal`.

**Fields that were neither columns nor decisions died.** `requires_schedule` and
`is_scheduled` are gone from `FulfillmentView` (`method.category` and
`scheduled_at !== null` answer both); `item_count` is gone from `CheckoutView`,
replaced by the basket itself - `items`, nested by table, which is what a view
of a checkout is. `scheduled_at` stayed, because it is a selectable column.
`FulfillmentParcel` gained `tracking_number`, a real column of
`shipping.shipments`, so "has this parcel a label" is read rather than carried in
a `Set`.

## 3. Named parameters (ruling 73)

**34 signatures under `api/domain/**`, `api/db/**` and `api/transport/**` spelled
a shape out at the call boundary. Zero do now.** Every one takes a named contract
type, an id, a primitive, or `tx: Executor`; where a function genuinely needed
two ids it takes two positional ids.

A representative handful: `fulfillments.getForOrder(order_id, userId, isAdmin)`,
`fulfillments.setMethod(id, method_id)`, `fulfillments.getSchedule(from, to,
employee_id)`, `addresses.create(userId, address, user_address)`,
`orders.createForCheckout(id, checkout_id, status)`,
`shipments.create(order_id, direction, tx)`,
`pickups.recordForShipment(shipment_id, date, time, confirmation_number,
location, tx)`, `images.uploadImage(user_id, filename, mime_type, size_bytes)`,
`emails.sendAuthVerificationEmail(user, url, isSignUp, transport, executor)`.

Seven contracts were added so a signature could name a real type rather than
invent one: `SoldLinePrice`, `OrderTotalsGuard`, `TrackingScan`,
`EmailRecipient`, `CarrierPickupBooking`, `CarrierLabel`, `ShippableCarrier`,
`PriceableLine`. Each derives from a row (`lint:contracts-derived` enforces it).

## 4. The lints

**`lint:no-literal-views`** (`api/scripts/lint-no-literal-views.ts`, in
`check.mjs`'s `api-lint` group, `--self-test` with 7 cases): fails a `return {`
object literal of two or more entries from any function under `api/domain/**`
outside `rules.ts`, and **any `Object.assign` outside `api/shared/views.ts`**.
Today: **0 findings, 15 accepted files**, each pinned both ways with one of three
reasons - a computed money answer (`quotes`, `pricing`, `sales-tax`: no SQL
assembles it and no table owns its shape), a wire-to-column re-spelling that dies
with the CRUD pass-through pass (`shipping/services`, `payments/details`), or a
small result record of counts and ids (`checkout/adopt`, `checkout/sweep`,
`payments/sweeps`, `media/pdfs`, `orders/place`).

**`lint:type-homes` now sees parameter annotations.** The scan already refused a
type DECLARED outside `@dorado/contracts`; it now also refuses an inline object
type in a parameter - both the annotated form (`f(x: { a: string })`) and the
destructured one (`f({ a }: { a: string })`) - while an object VALUE passed as an
argument is not a finding. Its self-test grew from 11 cases to 14, including the
one that used to assert the opposite. Today: **0 misplaced**, with the 20
pre-existing small-features accepted files unchanged.

## 5. Tests

Each view SQL has a repo test that parses it through its contract against built
rows: `db/orders/tests/view.test.ts`, `db/fulfillments/tests/view.test.ts`,
`db/shipping/shipments/tests/view.test.ts`,
`db/places/user-addresses/tests/view.test.ts`,
`db/checkout/checkouts/tests/view.test.ts`,
`db/shipping/carriers/tests/view.test.ts` - 18 tests over 6 files. They assert
the nesting (a child that came back as `[]` rather than `null`, a parcel that is
the linked shipment), the SQL-computed fields (`payable`, `line_total`,
`scheduled_at` in UTC, `locked`), and that a missing id reads back nothing rather
than an empty view.

## What is NOT done

`PaymentIntentView` and `PaymentDetailsView` are already ONE SQL read each, with
`jsonb_build_object` nesting - they are just not `.parse()`d, because their
`created_at` / `updated_at` come back as `Date` from the driver and the parse
would need the same `to_char` cast the new views use, across seven statements
plus a `buildUpdate` RETURNING clause. That is a small, separate diff.
