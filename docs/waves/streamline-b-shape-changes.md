# Streamline B: every request/response and behaviour change

The streamlining pass on shipping, fulfillments, products, media, places,
leads, reviews, rates, metals, mints and spots (D214 item 11) rewrote the
conformance-flagged use cases from their inputs inward. Ruling 44: *"I imagine
this will cause the frontend to break and THATS OK."* This file is the list
the frontend pass (D214 item 8) works from for THIS lane.

Most of these features already read as `load -> assert -> write` with typed
contract inputs (leads, reviews, rates, places, media/images, media/pdfs) and
needed no shape change; this file only lists what actually moved.

---

## 1. `fulfillments.attachToOrder` folded into `update`

No wire change - `POST /api/fulfillments/schedule_pickup` and friends are
unaffected. Internal only: `db/fulfillments/repo.ts`'s `attachToOrder(id,
{order_id})` is gone; `update(id, {order_id})` guards itself with `WHERE
order_id IS NULL` via a new `whereNull` option on `shared/db/patch.ts`'s
`buildUpdate` (the shared builder could not express "IS NULL" before - a bound
NULL parameter never equals anything, itself included).

## 2. `fulfillments.pickups` / `.directs` / `.shipments` (the link table):
upsert-only repos become `create` + `update`

No wire change to `POST /api/fulfillments/schedule_pickup` /
`schedule_direct` - same bodies. **Behaviour change, flagged for Jacob**: the
old `upsert.sql` used `ON CONFLICT ... DO UPDATE SET col = EXCLUDED.col`
unconditionally, so a RESCHEDULE that omitted an optional field (e.g.
`assigned_employee_id`) CLEARED it. The services now read the existing row
first and call `create` or `update`; `update` uses the standard
present-sets/absent-leaves-alone contract every other `update()` in this
codebase keeps, so an omitted field on a reschedule now LEAVES the existing
value rather than clearing it. `fulfillments.shipments` (the link table) reads
by `shipment_id` first - its unique key - not `fulfillment_id` (a fulfillment
may hold several parcels).

Frontend: no caller found (`grep -rln "schedule_pickup\|schedule_direct"
frontend/` is empty - these routes are not yet wired into the frontend).

## 3. `spots.spots`: `upsert` becomes `create` + `update`

No wire change - `GET /api/spots/spot_prices` is unaffected; this is the
cron/startup writer (`updateSpotPrices`) only. The service now reads
`spots.list()` first and calls `create` for a metal_id with no row yet
(never happens today - every metal is seeded) or `update` otherwise.

## 4. `metals.metals` / `products.mints`: `getAll` becomes `list`

Repo-internal rename only (`namesById`/`idsByName` are unchanged named
finders, built on `list()` now instead of `getAll()`). No wire change.

## 5. `shipping.services`: write bodies wired to their existing contracts

`carrier_services/create` and `/update` already parsed `CarrierServiceCreate`
/ `CarrierServicePatch` at transport, but the DOMAIN still re-typed the body
as a hand-rolled `ServiceInput` (`supports_pickup?: unknown`, a `flag()`
string-coercion helper, `name: (s.name ?? null) as string`) and the REPO
forced every patch to a full replace via `(patch as Record<string,
unknown>)[c] ?? null`. Both are gone: the domain takes the contract types
directly, and `update()` uses the shared present/absent/null contract.

**Behaviour change, flagged for Jacob**: `carrier_services/update` used to
CLEAR any field the caller omitted (full replace). It is a true partial patch
now. The admin form sends every field today, so nothing observable changes in
practice, but a future partial PATCH will behave differently than before.

**Status code, not shape**: `carrier_services/update` for an id nothing names
still answers `null` (200) - that did not change. What changed is the TYPE:
`id` is required on `CarrierServicePatch` now (was optional, defaulted via `if
(!input.id) return null`), so a request naming no id is a `400` at transport,
never reaching the service.

Frontend: `frontend/features/carriers/ui/CarrierServicesAdminTable.tsx`,
`.../CarrierServicesDrawer.tsx`, `.../CarriersDrawer.tsx`,
`frontend/features/carriers/queries.ts`.

## 6. `shipping/operations` - the seven deferred bodies, now ids and new data

**The contracts lane deferred these; item 11 says to do them now.** All seven
take the ids and numbers the server does not already hold, never a composed
address/package object. `address_id` resolves through `places.addresses`;
`package_id` resolves through `shipping.packages`. Every body is `.strict()`
in `@dorado/contracts` (`packages/contracts/src/wire/shipping.ts`) and parsed
once at `transport/shipping/operations/controller.ts`.

| route | was | is |
|---|---|---|
| `POST /shipping/validate_address` | `{ carrier_id?, address }` (a raw address object) | `{ carrier_id?, address_id }` |
| `POST /shipping/get_rates` | `{ carrier_id?, shippingType, address, pkg: {weight, dimensions}, pickupType?, declaredValue? }` | `{ carrier_id?, shippingType, address_id, package_id, weight, pickupType?, declaredValue? }` - dimensions come from the package row; `weight` is the one genuine measurement nothing else stores |
| `POST /shipping/check_pickup` | `{ carrier_id?, pickupAddress, code, readyDate }` | `{ carrier_id?, address_id, code, readyDate }` |
| `POST /shipping/get_locations` | `{ carrier_id?, address, radius_miles?, max_results? }` | `{ carrier_id?, address_id, radius_miles?, max_results? }` |
| `POST /shipping/get_tracking` | `{ shipment_id }` (unvalidated `req.body` destructure) | same shape, now a strict contract |
| `POST /shipping/cancel_label` | `{ shipment_id, carrier_id? }` (unvalidated) | same shape, now a strict contract |
| `POST /shipping/cancel_pickup` | `{ pickup_id, carrier_id? }` (unvalidated) | same shape, now a strict contract |

**New refusals**: `404 no address <id>` (all four address-taking routes),
`404/422` from `no package <id>` / `the parcel needs a weight` (get_rates).

**Status code change**: `check_pickup`'s "readyDate does not parse as a date"
refusal was a hand-thrown `400`. It is a domain `Invalid` now (`shared/errors.ts`)
and answers **422** - the shape passed transport (`readyDate` IS a string),
the business rule (it must parse as a date) failed after. A missing
`readyDate` is still `400` - the contract's `z.string()` refuses it before the
domain ever runs.

**Internal-only addition**: `domain/shipping/operations/service.ts` exports
`quoteRate` (resolved-row input, same shape `getRates` used to take) alongside
the new ids-based `getRates`. `domain/orders/place.ts` - a checkout use case
that already holds the resolved address row mid-transaction - calls
`quoteRate` directly rather than round-tripping through an id it just read;
that is the one caller this change touched outside shipping, and it is a
rename only (`shippingOperations.getRates` -> `.quoteRate`), no behaviour
change.

Frontend: `frontend/features/shipping/queries.ts` (`useShippingRates`,
`useShippingPickupTimes`, `useShippingLocations`,
`useShippingValidateAddress`, `useTracking`, `useShippingCancelLabel`,
`useShippingCancelPickup`), `frontend/features/shipping/types.ts`
(`ShippingRatesInput`, `ShippingPickupTimesInput`, `ShippingLocationsInput`,
`ShippingValidateAddressInput` all carry a raw `Address` today and need
`address_id`; `ShippingRatesInput.pkg` goes away in favour of `package_id` +
`weight`).

## 7. `PATCH /api/shipments/:id` - strict parsing, `patch-body.ts` retired for this one consumer

No wire shape change (`ShipmentPatch` is unchanged: `shipping_charge?,
shipping_actual?, tracking_number?, carrier_id?`) - it is now `.strict()` in
the contract and parsed with `parseStrict` at transport instead of the
`refusedUnknownField`/`refusedValue` pair from `shared/http/patch-body.ts`
(which keeps its other consumers - payouts, refiners - in other lanes). The
"tracking_number and carrier_id travel together" rule moved from the
transport-level `refusedField` into the domain (`patch.service.ts`), thrown as
`Invalid`.

**Status code change**: an unknown field or a wrong-typed value used to answer
`400` with a hand-built message (`"${field}" is not a field of a shipment
PATCH`). It is still `400` (zod's own parse failure, at the same transport
boundary), but the message is zod's own issue text now, not the bespoke one.
The "tracking pair" refusal moved from `400` to **422** (it is a business
rule, not a shape failure).

Frontend: `frontend/features/shipping/queries.ts` (`usePatchShipment`).

## 8. `POST /media/emails/send_created` and `/send_priced`

No wire shape change (`{ order_id }`) - the body is a named contract now
(`SendOrderEmailBody` in `packages/contracts/src/wire/media.ts`) instead of a
schema declared inline in the transport file, and `order_id` is `.uuid()`
rather than a bare `z.string()`, so a non-uuid id is now a `400` naming the
field instead of reaching the service and failing on the database read.

Frontend: no caller found - neither endpoint has a frontend consumer today.

---

## Not changed, checked and left alone

`leads`, `reviews`, `rates` (the row + `RateBand` reads), `places/addresses`,
`media/images`, `media/pdfs` and `products`' read surfaces already had
`refuse(` at zero, no `Record<string, unknown>` bodies, no object spreads
outside their own tests, and their write bodies already come from
`@dorado/contracts` parsed strictly at transport - no shape or behaviour
change was needed. `products/save_product`'s domain internals were rewritten
(dropped a `const {id, ...patch} = product` prop-spread and an `as
ProductPatch` cast, and the repo's own full-replace-via-cast was replaced with
the standard `buildUpdate` contract) but the wire body and behaviour are
unchanged - the contract already required every column.
