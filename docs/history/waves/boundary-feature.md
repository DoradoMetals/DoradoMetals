# Rulings 69–70 — fulfillments owns the handover (2026-09-04)

Jacob, verbatim:

> **69.** "Checkout/Orders shouldn't care about what's going on over in
> fulfillment world."
>
> **70.** "Everything needs to stay in its own lane. The only thing that should
> be deciding if fulfillments is 'ready' is fulfillments." "All checkout needs
> to do is send the checkout row and ask fulfillments if the order is ready for
> placement." "It shouldn't know anything else about fulfillments."

Ruling 68 had made `CheckoutView = Checkout.extend({ missing })` with `missing`
computed **by category, inside checkout**. That is checkout deciding whether a
fulfillment is complete, and it was only possible because nine columns
describing the handover sat on `checkout.checkouts`.

## The migration: 128_the_handover_lives_with_the_fulfillment.sql

Nine columns leave `checkout.checkouts` for the detail row of the draft
fulfillment — which is where the same value already lived once an order
existed. Migration 111 predicted this exactly: *"Under the draft model those
live on the fulfillment and its children… they stay until the checkout
conversion is proven, then leave with their own migration."*

| left `checkout.checkouts` | landed on |
| --- | --- |
| `shipper_address_id` | `shipping.shipments.shipper_address_id` (via `fulfillments.shipments`) |
| `package_id` | `shipping.shipments.package_id` |
| `carrier_service_id` | `shipping.shipments.carrier_service_id` |
| `pickup_date`, `pickup_time` | **new** `shipping.shipments.pickup_date/pickup_time` |
| `pickup_address_id` | `fulfillments.pickups.pickup_address_id` |
| `appointment_location_id` | `fulfillments.directs.location_id` |
| `appointment_time` | `fulfillments.pickups.start_time` / `fulfillments.directs.start_time` |
| `fulfillment_method_id` | `fulfillments.fulfillments.method_id` |

Only **two** things were genuinely missing, and only two were added:

1. **The courier slot.** `shipping.shipments` had no column for the date and
   time the customer asked the carrier to come — `domain/shipping/labels.ts`
   said so in its own comment ("no column remembers a courier's requested
   slot") and passed it as an argument instead. TEXT, for 113's reason: they
   are the provider's own strings. `shipping.pickups` is **not** the home — that
   row is the carrier's ANSWER (confirmation number, location, status), written
   after the label is bought.
2. **A draft's detail row starts empty**, so
   `fulfillments.pickups.pickup_address_id` and
   `fulfillments.directs.location_id` widen to nullable. Widening only.

**Measured read-only on dev before writing it (2026-09-04):** 6 checkout rows,
**zero** non-null values in all nine columns, and zero draft fulfillments. So
the four `UPDATE … FROM` moves carry nothing on dev and the drop loses nothing,
provably. They are written for the databases that are not dev. `lint:migrations`
guards `exchange`, which this schema is not; CLAUDE.md is explicit that
`checkout.*` is device-sync rather than a ledger.

## `recipient_address_id` STAYS on the checkout

The one call the brief left open, and the reason is that it is not a handover
choice at all:

- **It is the sale's TAX key.** `domain/orders/place.ts` reads its `state` and
  hands it to `sales-tax` to price the order — before anything about the
  handover is consulted. Moving it would force a sale to mint a fulfillment
  before it could be *quoted*, which is checkout asking fulfillment for
  permission to price. That is ruling 70 backwards.
- **Migration 123's composite foreign key** `(user_id, recipient_address_id) ->
  places.user_addresses` says "this address is in THIS ROW'S OWNER'S book". No
  fulfillment row carries a user, so no fulfillment table can make that
  statement. `checkouts.deferAddressOwnership` now names one constraint instead
  of three; the other two went with their columns.

## The API

`POST /api/checkout/fulfillment` and `GET /api/checkout/rates` are **deleted**.

| route | what it does |
| --- | --- |
| `POST /api/fulfillments` | the draft for a checkout: `{ checkout_id, method_id? \| handoff_code? }`. Idempotent — an existing draft has its METHOD set rather than a second minted. Neither id given resolves the direction's default, which is what a surface with no handover step (the sale) wants. |
| `GET /api/fulfillments/:id` | the `FulfillmentView`: row + method + detail + `parcel` + `missing`. |
| `PATCH /api/fulfillments/:id` | one strict contract patch per category — `{ shipment }`, `{ pickup }` or `{ direct }` — and the fulfillment's own method says which one it is allowed to be. |
| `GET /api/fulfillments/:id/rates` | declared by fulfillments (it owns the parcel facts), handled in `domain/shipping/operations` (it owns the carrier call). |

Owner-or-admin is checked in transport (`transport/fulfillments/owner.ts`): a
draft belongs to the checkout that points at it, an attached fulfillment to its
order. 404 rather than 403, so the answer cannot confirm somebody else's
fulfillment exists.

## `missing` is composed, and checkout never inspects the half it did not write

```
checkout's own list        fulfillments' answer
  items                      shipper_address_id / package_id / carrier_service_id
  fulfillment_id             pickup_date / pickup_time   (only when the handoff
  recipient_address_id (sale)                             requires a schedule)
  payment_details_id (purchase)   pickup_address_id / location_id / start_time
```

`fulfillments.missing(fulfillment_id, tx)` is the ONE function checkout calls.
`domain/checkout/rules.ts` `checkoutState` takes its answer as an opaque
`handover: FulfillmentStep[]` and splices it into position — so no file under
`domain/checkout` names a fulfillment column, and `lint:domain-boundaries` can
prove it.

The entries are COLUMN NAMES now, not step labels: each one IS the null column
of the detail row, so a caller that renders a step and a caller that patches it
send the same string.

Placement follows: `rules.assertPlaceable(missing)` refuses a non-empty list,
`fulfillments.attachToOrder(fulfillment_id, order_id, tx)` claims the draft, the
address the order snapshots comes from `fulfillments.addressIdOf`, and the label
purchase is `shipping.buyLabel(shipment_id)` after the commit — keyed from the
fulfillment's own shipment link, with the courier slot read off the parcel's own
columns rather than passed in.

`domain/shipping/parcel.ts` is new and small: shipping still owns every write to
`shipping.shipments`, and this is the door fulfillments calls through, because
`domain/shipping/shipments/service.ts` imports `domain/fulfillments/service.ts`
and a call the other way would be a cycle.

## The lint: `lint:domain-boundaries`

`api/scripts/lint-domain-boundaries.ts`, 14 self-test cases, wired into
`check.mjs`'s api-lint group. domain → the column names of the schemas it may
not name, derived from the contracts' generated entity files by `<schema>.<table>`
header. Lanes: `domain/checkout` and `domain/orders` may not name a
`fulfillments` or `shipping` column; `domain/fulfillments` may not name a
`checkout` one.

Three kinds of name are dropped **by construction**, because none of them is a
finding:

1. **Ambiguous** — owned by two schemas, so it identifies nothing
   (`recipient_address_id`, `fulfillment_id`, `shipment_id`, `order_id`,
   `user_id`, every audit column).
2. **Single words** — `length`, `code`, `name`, `type`, `category`, `amount`,
   `status` are all real columns and all ordinary English. A column name with no
   underscore is a word.
3. **The other domain's own row id** — `<schema singular>_id`. Holding the other
   resource's id and handing it over IS the boundary (ruling 43).

`payments` is deliberately not in either lane: checkout OWNS `payment_method_id`
and `payment_details_id` as columns of its own row and `CheckoutPayoutForm` is a
`PaymentDetails` pick by design (D210), so that boundary is already a contract
derivation. Orders' payment-intent handling is D179's subject.

ACCEPTED holds two admin-surface files, pinned both sides:
`domain/orders/service.ts` (10) — the admin cancel's `OrderCancelBody`
(`carrier_service_id` + `package_id` for a RETURN parcel no customer handover
describes) and the hand-entered tracking number; `domain/orders/rules.ts` (2) —
`OrderActions.buy_label` / `update_tracking`, answered from the parcel's own
state (ruling 67).

## Shape changes for the one frontend pass (ruling 44)

- `Checkout` loses nine columns; `CheckoutPatch` is two (`payment_method_id`,
  `recipient_address_id`); `CheckoutWrite` adds the two pointers.
- `CheckoutStep` is four entries; `CheckoutMissing = CheckoutStep | FulfillmentStep`
  and `CheckoutView.missing` is an array of that.
- `FulfillmentView` gains `parcel` (`FulfillmentParcel` — the shipment row
  narrowed to the customer's choices) and `missing`.
- `POST /checkout/fulfillment` → `POST /fulfillments`; `GET /checkout/rates` →
  `GET /fulfillments/:id/rates`.
- `CheckoutFulfillmentBody` is gone; `FulfillmentCreateBody`,
  `FulfillmentPatchBody` and the three `Fulfillment*Choices` are new.
- `@dorado/client` gains `useCreateFulfillment`, `usePatchFulfillment`,
  `useFulfillment`, `useFulfillmentRates`; loses `useSetCheckoutFulfillment` and
  `useCheckoutRates`. `keys.checkout.rates` is `keys.fulfillments.rates`.

`FulfillmentStep` lives in `fulfillments/fulfillments.ts` and
`FulfillmentCreateBody` in `computed/fulfillments.ts` — not for taste, but
because `checkout/checkouts.ts` has to import the step list and
`FulfillmentCreateBody.checkout_id` has to derive from `Checkout.shape.id`
(`lint:contracts-derived`), and putting both in one file is a module cycle.
