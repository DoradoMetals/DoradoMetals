# contracts-entities — one file per database entity, one flat namespace

Jacob: *"No more fucking wires, frontend needs to take the API shape, not the
other way around."* / *"Fix the contracts."* / *"Same as DB shape, I think.
Each entity gets its own file."* / *"all types that are going between the api
and server LIVE IN A CONTRACT."* / *"I don't think it needs to be
rates.rates.New. Do you not understand how dumb that looks? It should be Rate.
That's it."* / *"For new, it can just send the patch!!"* / *"why do we still
have all the exchange contracts?"*

`packages/contracts/src/generated/` (one file per SCHEMA, 90 rows in eighteen
barrels) and `packages/contracts/src/wire/` (126 hand-composed response and
request shapes) are DELETED. What replaces them mirrors the database.

## The structure

```
src/<schema>/<table>.ts     one entity            51 files
src/<schema>/enums.ts       the schema's Postgres enums, emitted once
src/<schema>/index.ts       flat re-export        (generated)
src/schemas.ts              flat re-export        (generated)
src/index.ts                schemas.ts plus computed/
src/computed/               the three shapes no table backs
```

`exchange` IS NOT GENERATED. Nothing in `api/` or `frontend/` imports a legacy
row, and the backfill and audit scripts read that schema through their own raw
SQL; generating 39 contracts nobody imported only made the flat namespace
collide with itself. The three exchange tables that were still on a live path
turned out not to need it: the payout shapes derive from `payments.details` +
`orders.transactions` + `payments.methods` (which is what
`db/payouts/sql/get_for.sql` actually selects), the admin users list derives
from `auth.users`, and `GET /carrier_services` is `shipping.services` with the
three legacy spellings aliased back.

Each entity file is a GENERATED REGION plus hand-written derivations:

```ts
// generated:start
export const Rate = z.object({ ... });   // from information_schema
export type Rate = z.infer<typeof Rate>;
// generated:end

export const RatePatch = Rate.pick({ metal_id: true, unit: true, ... }).partial();
```

`scripts/generate-entities.mjs` (a rewrite of `generate-tables.mjs`) owns the
region and nothing else: it creates a missing entity file with an empty hand
section, rewrites the region of an existing one, and **never deletes a file** —
a dropped table is reported by `verify:fresh` rather than removed along with
the derivations somebody wrote on it. The entity's NAME comes from the
generator's own `ENTITY` map; a new table fails the run until it is named
there, which is the one decision a person has to make.

`verify:fresh` compares REGIONS, not files, because a fresh generation has no
hand section; the fully generated files (`enums.ts`, each `index.ts`,
`schemas.ts`) are still compared byte for byte. It carries a 60-file floor.

## The naming

ONE FLAT NAMESPACE — no `orders.rates.New`, no schema prefixes:

```ts
import { Rate, RatePatch, Order, OrderItem, BullionStorefront } from "@dorado/contracts";
```

A collision is resolved by the name the code already uses for the concept:
`orders.items` is an `OrderItem`, `checkout.items` a `CheckoutItem`,
`refiners.items` a `RefinerItem`, `places.addresses` an `Address`,
`orders.addresses` an `OrderAddressLink`, `shipping.services` a
`CarrierService`, `fulfillments.methods` a `FulfillmentMethod`. 163 exports,
no collisions.

**`<Entity>Patch` IS THE ONLY WRITE TYPE.** A create sends the same patch an
update does; the database's NOT NULL columns and defaults decide what a create
needs. Every `New*` export is gone from the contracts, and `NewRate`,
`NewLead`, `NewReview`, `NewCheckoutItem`, `PickupInput`, `DirectInput` and the
`OrderItemFromBullion`/`OrderItemFromScrap` union went with them: the repos
take `create(patch, tx)` / `update(id, patch, tx)` and a bullion line is now a
value test (`input.bullion_id ? … : …`) rather than a type. Where an id is
needed BEFORE the statement — `save_product`, `updateService`, the two
fulfillment bookings, all of which read the row first — the transport asserts
it with the existing `Invalid`, because an absent one would otherwise fail as a
lookup miss rather than as a missing field.

Two enums needed distinct flat names: `orders.direction` is `Direction` and
`shipping.direction` is `ShipmentDirection`; `fulfillments.category` is
`FulfillmentCategory`.

## The rule below the region, and the gate that holds it

Everything under `// generated:end` is a `.pick()` / `.omit()` / `.extend()` of
an entity. `api/scripts/lint-contracts-derived.ts` (`lint:contracts-derived`,
in `pnpm check`'s api-lint group beside `lint:type-homes`) fails a `z.object(`
or `z.looseObject(` outside a generated region that DECLARES a field of its own
— a property whose value contains a bare zod leaf. Composing schemas is fine
(`address_id: Address.shape.id`, `items: z.array(CheckoutItemPatch)`);
genuinely new data goes through `.extend()`.

Self-tested through `lib/self-test-harness.ts` with six cases, both directions,
including the same literal inside and outside a region. Floored at 60 files: a
walk that opens nothing passes everything.

`src/computed/` is the one exception, PINNED FROM BOTH SIDES — an undeclared
file there fails, and a declared file that stops needing the exception fails
too, so the list can only shrink. Two entries: `quotes.ts` (priced arithmetic,
returned and never stored — Jacob's no-client-money-math ruling makes these the
permanent API contract for the quote surface) and `providers.ts` (the carrier
catalogue the FedEx adapter assembles, plus `CarrierRateQuote`).

## What happened to each wire schema

126 exported wire schemas: **102 became derivations in an entity file**, **22
moved to `src/computed/`**, **2 were deleted** — `ShippingGetRatesBody`, whose
endpoint the parcel-server lane replaced, and `TrackingEvent`, an
`exchange.tracking_events` row nothing imported.

The flat `Bullion` was the one the brief expected to die, and it did not have
to: `db/products/sql/get_storefront.sql` projects exactly `products.bullion`'s
public columns plus `metal_id`/`mint_id`, which `compose.ts` resolves into
`metal_type`/`mint_name` and drops. That is a pick plus two extends, so it
survives as `BullionStorefront` — and the two extends are visibly the join a
later products read pivot removes. Keeping it kept the two `/products` cases in
`validate:wire`.

Duplicate names collapsed on the way: `Fulfillment` and `OrderFulfillment` were
one row under two names; `OrderAddress` and `Address` are both
`places.addresses`; `NewLead`/`LeadPatch`, `NewReview`/`ReviewPatch` and
`RateInput`/`RatePatch` collapsed into one patch each.

| wire schema | now |
|---|---|
| `AccountTransaction` | `AccountTransaction` |
| `Address` | `Address` |
| `AddressCreateBody` | `AddressCreateBody` |
| `AddressIdBody` | `AddressIdBody` |
| `AddressUpdateBody` | `AddressUpdateBody` |
| `AddressWrite` | `AddressPatch` |
| `AdminRate` | `AdminRate` |
| `Bullion` | `BullionStorefront` |
| `CancelPaymentIntentBody` | `CancelPaymentIntentBody` |
| `Carrier` | `CarrierRead` |
| `CarrierCreate` | `CarrierPatch` |
| `CarrierDeleteBody` | `CarrierDeleteBody` |
| `CarrierHandoff` | `CarrierHandoff` |
| `CarrierPatch` | `CarrierPatch` |
| `CarrierService` | `CarrierServiceRead` |
| `CarrierServiceCreate` | `CarrierServicePatch` |
| `CarrierServiceDeleteBody` | `CarrierServiceDeleteBody` |
| `CarrierServiceOption` | `CarrierServiceOption` |
| `CarrierServicePatch` | `CarrierServicePatch` |
| `CatalogQuote` | `CatalogQuote` |
| `CatalogQuoteBody` | `CatalogQuoteBody` |
| `CatalogQuoteLine` | `CatalogQuoteLine` |
| `CheckoutFulfillmentBody` | `CheckoutFulfillmentBody` |
| `CheckoutItemsBody` | `CheckoutItemsBody` |
| `CheckoutPatchBody` | `CheckoutPatchBody` |
| `CheckoutPatchColumns` | `CheckoutPatch` |
| `CheckoutPayoutBody` | `CheckoutPayoutBody` |
| `CheckoutPayoutForm` | `CheckoutPayoutForm` |
| `CreateLeadBody` | `LeadPatch` |
| `CreateReviewBody` | `ReviewPatch` |
| `Direction` | `Direction` |
| `Fulfillment` | `Fulfillment` |
| `FulfillmentCancelScheduleBody` | `FulfillmentCancelScheduleBody` |
| `FulfillmentDirect` | `FulfillmentDirect` |
| `FulfillmentMethod` | `FulfillmentMethodRead` |
| `FulfillmentMethodPatch` | `FulfillmentMethodPatch` |
| `FulfillmentPickup` | `FulfillmentPickup` |
| `FulfillmentSetMethodBody` | `FulfillmentSetMethodBody` |
| `FulfillmentSetStatusBody` | `FulfillmentSetStatusBody` |
| `GetSalesTaxBody` | `GetSalesTaxBody` |
| `Image` | `Image` |
| `Lead` | `Lead` |
| `LeadPatch` | `LeadPatch` |
| `MediaDeleteBody` | `MediaDeleteBody` |
| `MediaUploadBody` | `MediaUploadBody` |
| `NewCheckoutItem` | `CheckoutItemPatch` |
| `Order` | `OrderRead` |
| `OrderAddress` | `Address` |
| `OrderCancel` | `OrderCancelBody` |
| `OrderCreate` | `OrderCreateBody` |
| `OrderFulfillment` | `Fulfillment` |
| `OrderItem` | `OrderItem` |
| `OrderItemCreate` | `OrderItemPatch` |
| `OrderItemFromBullion` | `OrderItemPatch` |
| `OrderItemFromScrap` | `OrderItemPatch` |
| `OrderItemPatch` | `OrderItemPatch` |
| `OrderPatch` | `OrderPatch` |
| `OrderQuote` | `OrderQuote` |
| `OrderQuoteBody` | `OrderQuoteBody` |
| `OrderQuoteLine` | `OrderQuoteLine` |
| `OrderReviewCreate` | `OrderReviewBody` |
| `OrderSendToRefiner` | `OrderSendToRefinerBody` |
| `OrderSpot` | `OrderSpot` |
| `OrderSpotWrite` | `OrderSpotWrite` |
| `OrderSpotsPut` | `OrderSpotsPutBody` |
| `OrderTotals` | `OrderTotals` |
| `OrderView` | `OrderView` |
| `OrderViewItem` | `OrderViewItem` |
| `OrderViewPayout` | `OrderViewPayout` |
| `OrderViewProduct` | `BullionPublic` |
| `OrderViewShipment` | `OrderViewShipment` |
| `OrderViewUser` | `UserSummary` |
| `PaymentAttempt` | `IntentAttempt` |
| `PaymentDetails` | `IntentDetails` |
| `PaymentIntent` | `PaymentIntentView` |
| `Payout` | `Payout` |
| `PayoutDetails` | `PayoutDetails` |
| `PayoutPatch` | `PayoutPatch` |
| `ProductCreate` | `BullionPatch` |
| `ProductPatch` | `BullionPatch` |
| `ProfitBreakdown` | `ProfitBreakdown` |
| `ProfitCategoriesDict` | `ProfitCategoriesDict` |
| `ProfitMetal` | `ProfitMetal` |
| `ProfitMetalsDict` | `ProfitMetalsDict` |
| `PurchaseOrderQuote` | `PurchaseOrderQuote` |
| `PurchaseOrderQuoteBody` | `PurchaseOrderQuoteBody` |
| `PurchaseOrderQuoteLine` | `PurchaseOrderQuoteLine` |
| `PurchaseQuoteItem` | `PurchaseQuoteItem` |
| `PurchaseQuoteProduct` | `PurchaseQuoteProduct` |
| `PurchaseQuoteScrap` | `PurchaseQuoteScrap` |
| `QuoteItem` | `QuoteItem` |
| `Rate` | `RateRead` |
| `RateInput` | `RatePatch` |
| `RatePatch` | `RatePatch` |
| `Refiner` | `RefinerRead` |
| `RefinerItem` | `RefinerItem` |
| `RefinerItemPatch` | `RefinerItemPatch` |
| `RefinerOrder` | `RefinerOrder` |
| `RefinerOrderPatch` | `RefinerOrderPatch` |
| `RefinerSpot` | `RefinerSpot` |
| `RefinerSpotWrite` | `RefinerSpotWrite` |
| `Review` | `Review` |
| `ReviewPatch` | `ReviewPatch` |
| `SalesOrderQuote` | `SalesOrderQuote` |
| `SalesOrderQuoteBody` | `SalesOrderQuoteBody` |
| `SalesOrderQuoteLine` | `SalesOrderQuoteLine` |
| `ScheduleFulfillmentDirectBody` | `FulfillmentDirectPatch` |
| `ScheduleFulfillmentPickupBody` | `FulfillmentPickupPatch` |
| `SendOrderEmailBody` | `SendOrderEmailBody` |
| `Shipment` | `Shipment` |
| `ShipmentPatch` | `ShipmentPatch` |
| `ShipmentPickup` | `ShipmentPickup` |
| `ShippingCancelLabelBody` | `ShippingCancelLabelBody` |
| `ShippingCancelPickupBody` | `ShippingCancelPickupBody` |
| `ShippingCheckPickupBody` | `ShippingCheckPickupBody` |
| `ShippingGetLocationsBody` | `ShippingGetLocationsBody` |
| `ShippingGetRatesBody` | *deleted* - `POST /shipping/get_rates` became `GET /checkout/rates?direction=` (ruling 58); the body is read off the checkout row |
| `ShippingGetTrackingBody` | `ShippingGetTrackingBody` |
| `ShippingValidateAddressBody` | `ShippingValidateAddressBody` |
| `SpotPrice` | `SpotPrice` |
| `TrackingEvent` | *deleted* - an `exchange.tracking_events` row nothing imported |
| `UpdateCreditBody` | `UpdateCreditBody` |
| `UpdatePaymentIntentBody` | `UpdatePaymentIntentBody` |
| `User` | `AdminUser` |
| `UserAddress` | `UserAddressRead` |
| `UserAddressWrite` | `UserAddressPatch` |

## The consumers

| | files touched |
|---|---|
| `api/` | 100 |
| `frontend/` | 82 |

Mechanical, by codemod, then by hand where the codemod could not be right:

- **`export type { X } from "@dorado/contracts"` cannot re-export a namespace
  member**, and once the names went flat a local `export type X = X` is a
  self-reference. Twenty api and frontend modules carried one; all are gone and
  their consumers import from `@dorado/contracts` directly, which is the hop
  the contract exists to remove. Four had already become duplicates
  `lint:type-homes` refuses (`Direction`, `OrderView`, `CarrierHandoff`,
  `CarrierServiceOption`).
- **`type Category = fulfillments.MethodsRow["category"]`** was an ACCEPTED
  duplicate in `lint-type-homes.ts` whose own reason said "THE CONTRACT IS
  ALREADY THE HOME". The alias is gone from both files and the ACCEPTED entry
  with it — the map is pinned from both sides, so it had to go.
- **Two gate scripts read the contracts by path and both broke silently.**
  `lint:input-shapes` resolved `src/generated/<schema>.ts` and then
  `export const Row`; each time it found nothing, every column lookup returned
  null and it checked ZERO input shapes. Its own "SCAN IS BROKEN" floor is what
  said so — twice. It reads the entity out of the generated region now.
  `validate-against-db.mjs` imported `dist/generated/exchange.js`; it walks all
  seventeen generated schemas instead, and went from 37 exchange tables to 47.
- **Nullability that was wrong and is now right.** `shipping.services.carrier_id`
  is nullable where the exchange copy was not (two carrier screens);
  `products.bullion.variant_label` is NOT NULL where the flat `Bullion` said
  otherwise (two frontend fixtures); `places.addresses` timestamps are NOT NULL
  where `exchange.addresses`' were not (the blank-address template).
- **The parcel-server lane's two dropped columns** (`checkout.checkouts.package_weight`,
  `declared_value`, migration 121) reached this lane through the merge and
  through the dev database at once. Two journey tests from the api-journeys lane
  still sent them — a cross-lane conflict git could not see, since the two
  changes never touched the same line.

## Verification

| step | exit |
|---|---|
| `contracts generate` + `build` | 0 — 51 entities, 23 generated barrels |
| `contracts verify:fresh` | 0 — 74 generated files compared, all match |
| `contracts validate` | 0 — 47/47 tables with data parse clean |
| `api lint:contracts-derived` | 0 — 77 files walked, 0 findings |
| `api lint:contracts-derived --self-test` | 0 — 6 cases, both directions |
| `api lint:input-shapes` (+ self-test) | 0 / 0 |
| `pnpm check:fast` | PASS |
| `api validate:wire` | 0 — 28 shapes match, 0 diverge, 3 skipped |
| `frontend typecheck` | 0 |
| `frontend test` | 0 — 211/211 across 38 files |

## Left for later

- The two `.extend()`s on `BullionStorefront` are a join the API still
  performs. When the products read pivots to serving rows, they go and the
  client maps `metal_id`/`mint_id` against `/metals` and `/mints`.
- `ProductPatch` in `db/products/repo.ts` is still a full-replace type whose
  columns went optional with the patch collapse; the service spells every field
  by name, so an absent one now binds NULL rather than failing to compile. That
  is the pre-existing "full replace, not a sparse patch" behaviour, and it wants
  its own pass.
