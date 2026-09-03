# contracts-entities — one file per database entity

Jacob: *"No more fucking wires, frontend needs to take the API shape, not the
other way around."* / *"Fix the contracts."* / *"Same as DB shape, I think.
Each entity gets its own file."* / *"all types that are going between the api
and server LIVE IN A CONTRACT."*

`packages/contracts/src/generated/` (one file per SCHEMA, 90 rows in eighteen
barrels) and `packages/contracts/src/wire/` (126 hand-composed response and
request shapes) are DELETED. What replaces them mirrors the database.

## The structure

```
src/<schema>/<table>.ts     one entity            90 files
src/<schema>/enums.ts       the schema's Postgres enums, emitted once   7 files
src/<schema>/index.ts       the schema's table namespaces (generated)  19 files
src/schemas.ts              the schema namespaces         (generated)
src/index.ts                schemas.ts plus computed/
src/computed/               the two shapes no table backs
```

Each entity file is a GENERATED REGION plus hand-written derivations:

```ts
// generated:start
export const Row = z.object({ ... });   // from information_schema
export type Row = z.infer<typeof Row>;
// generated:end

export const Patch = Row.pick({ status: true, notes: true }).partial().strict();
```

`scripts/generate-entities.mjs` (a rewrite of `generate-tables.mjs`) owns the
region and nothing else: it creates a missing entity file with an empty hand
section, rewrites the region of an existing one, and **never deletes a file** —
a dropped table is reported by `verify:fresh` rather than removed along with
the derivations somebody wrote on it.

`verify:fresh` compares REGIONS now, not files, because a fresh generation has
no hand section; the fully generated files (`enums.ts`, each `index.ts`,
`schemas.ts`) are still compared byte for byte. It carries a 60-file floor.

## The naming

The schema and the table are the namespaces; the shape's role is the export.

```ts
import { orders, products, checkout } from "@dorado/contracts";

orders.orders.Row / .Read / .View / .New / .Patch / .CancelBody
orders.items.Row / .ViewItem / .New / .NewBullion / .NewScrap / .Patch
products.bullion.Row / .Public / .Storefront / .New / .Patch
checkout.items.New          orders.enums.Direction
```

`Row` is always the table. `New` and `Patch` are always write bodies. Everything
else is a named read or body and says what it is (`Read`, `View`, `Public`,
`Details`, `Summary`, `Write`, `CreateBody`, `CancelBody`).

**One deviation from the brief, deliberate**: every enum goes to its OWNING
schema's `enums.ts`, not just the ones shared across tables. `orders.direction`
types `orders.orders`, `fulfillments.methods` and `payments.methods` — three
schemas — so "emitted once" only holds if ownership decides the home. A table
imports the enums it uses, across schemas where it must
(`exchange/sales_tax_rules.ts` imports from `../public/enums.js`).

`public` is a JavaScript reserved word, so `schemas.ts` exports it as
`public_schema`. It is the only schema that hits the rule; the generator
carries the reserved-word list.

## The rule below the region, and the gate that holds it

Everything under `// generated:end` is a `.pick()` / `.omit()` / `.extend()` of
a `Row`. `api/scripts/lint-contracts-derived.ts` (`lint:contracts-derived`, in
`pnpm check`'s api-lint group beside `lint:type-homes`) fails a `z.object(` or
`z.looseObject(` outside a generated region that DECLARES a field of its own —
a property whose value contains a bare zod leaf. Composing schemas is fine
(`address_id: Row.shape.id`, `items: z.array(New)`); genuinely new data goes
through `.extend()`, where it reads as an addition to a row rather than as a
table of its own.

Self-tested through `lib/self-test-harness.ts` with six cases, both directions,
including the same literal inside and outside a region. Floored at 60 files: a
walk that opens nothing passes everything.

`src/computed/` is the one exception, PINNED FROM BOTH SIDES — an undeclared
file there fails, and a declared file that stops needing the exception fails
too, so the list can only shrink. Two entries: `quotes.ts` (priced arithmetic,
returned and never stored — Jacob's no-client-money-math ruling makes these the
permanent API contract for the quote surface) and `providers.ts` (the carrier
catalogue the FedEx adapter assembles).

## What happened to each wire schema

126 exported wire schemas: **104 became derivations in an entity file**, **22
moved to `src/computed/`**, **0 were deleted outright**.

The flat `Bullion` was the one the brief expected to die, and it did not have
to: `db/products/sql/get_storefront.sql` projects exactly `products.bullion`'s
public columns plus `metal_id`/`mint_id`, which `compose.ts` resolves into
`metal_type`/`mint_name` and drops. That is a pick plus two extends, so it
survives as `products.bullion.Storefront` — and the two extends are visibly the
join a later products read pivot removes. Keeping it kept the two `/products`
cases in `validate:wire`, which are the ones the storefront depends on.

Duplicate names collapsed on the way: `Fulfillment` and `OrderFulfillment` were
one row under two names, `OrderAddress` and `Address` are both
`places.addresses.Row`.

| wire schema | was in | now |
|---|---|---|
| `AccountTransaction` | transactions.ts | `exchange.account_transactions.Row` |
| `Address` | address.ts | `places.addresses.Row` |
| `AddressCreateBody` | address.ts | `places.addresses.CreateBody` |
| `AddressIdBody` | address.ts | `places.addresses.IdBody` |
| `AddressUpdateBody` | address.ts | `places.addresses.UpdateBody` |
| `AddressWrite` | address.ts | `places.addresses.Write` |
| `AdminRate` | rates.ts | `rates.rates.AdminRead` |
| `Bullion` | products.ts | `products.bullion.Storefront` |
| `CancelPaymentIntentBody` | payments.ts | `payments.intents.CancelBody` |
| `Carrier` | shipping.ts | `shipping.carriers.Read` |
| `CarrierCreate` | shipping.ts | `shipping.carriers.New` |
| `CarrierDeleteBody` | shipping.ts | `shipping.carriers.DeleteBody` |
| `CarrierHandoff` | shipping.ts | `providers.CarrierHandoff` |
| `CarrierPatch` | shipping.ts | `shipping.carriers.Patch` |
| `CarrierService` | shipping.ts | `exchange.carrier_services.Row` |
| `CarrierServiceCreate` | shipping.ts | `shipping.services.New` |
| `CarrierServiceDeleteBody` | shipping.ts | `shipping.services.DeleteBody` |
| `CarrierServiceOption` | shipping.ts | `providers.CarrierServiceOption` |
| `CarrierServicePatch` | shipping.ts | `shipping.services.Patch` |
| `CatalogQuote` | quotes.ts | `quotes.CatalogQuote` |
| `CatalogQuoteBody` | quotes.ts | `quotes.CatalogQuoteBody` |
| `CatalogQuoteLine` | quotes.ts | `quotes.CatalogQuoteLine` |
| `CheckoutFulfillmentBody` | checkout.ts | `checkout.checkouts.FulfillmentBody` |
| `CheckoutItemsBody` | checkout.ts | `checkout.items.SyncBody` |
| `CheckoutPatchBody` | checkout.ts | `checkout.checkouts.PatchBody` |
| `CheckoutPatchColumns` | checkout.ts | `checkout.checkouts.Patch` |
| `CheckoutPayoutBody` | checkout.ts | `checkout.checkouts.PayoutBody` |
| `CheckoutPayoutForm` | checkout.ts | `checkout.checkouts.PayoutForm` |
| `CreateLeadBody` | leads.ts | `leads.leads.New` |
| `CreateReviewBody` | reviews.ts | `reviews.reviews.New` |
| `Direction` | direction.ts | `orders.enums.Direction` |
| `Fulfillment` | fulfillments.ts | `fulfillments.fulfillments.Row` |
| `FulfillmentCancelScheduleBody` | fulfillments.ts | `fulfillments.fulfillments.CancelScheduleBody` |
| `FulfillmentDirect` | fulfillments.ts | `fulfillments.directs.Row` |
| `FulfillmentMethod` | fulfillments.ts | `fulfillments.methods.Read` |
| `FulfillmentMethodPatch` | fulfillments.ts | `fulfillments.methods.Patch` |
| `FulfillmentPickup` | fulfillments.ts | `fulfillments.pickups.Row` |
| `FulfillmentSetMethodBody` | fulfillments.ts | `fulfillments.fulfillments.SetMethodBody` |
| `FulfillmentSetStatusBody` | fulfillments.ts | `fulfillments.fulfillments.SetStatusBody` |
| `GetSalesTaxBody` | tax.ts | `tax.sales_tax.QuoteBody` |
| `Image` | media.ts | `media.images.Row` |
| `Lead` | leads.ts | `leads.leads.Row` |
| `LeadPatch` | leads.ts | `leads.leads.Patch` |
| `MediaDeleteBody` | media.ts | `media.images.DeleteBody` |
| `MediaUploadBody` | media.ts | `media.images.UploadBody` |
| `NewCheckoutItem` | checkout.ts | `checkout.items.New` |
| `Order` | orders.ts | `orders.orders.Read` |
| `OrderAddress` | orders.ts | `places.addresses.Row` |
| `OrderCancel` | orders.ts | `orders.orders.CancelBody` |
| `OrderCreate` | orders.ts | `orders.orders.New` |
| `OrderFulfillment` | fulfillments.ts | `fulfillments.fulfillments.Row` |
| `OrderItem` | orders.ts | `orders.items.Row` |
| `OrderItemCreate` | orders.ts | `orders.items.New` |
| `OrderItemFromBullion` | orders.ts | `orders.items.NewBullion` |
| `OrderItemFromScrap` | orders.ts | `orders.items.NewScrap` |
| `OrderItemPatch` | patches.ts | `orders.items.Patch` |
| `OrderPatch` | patches.ts | `orders.orders.Patch` |
| `OrderQuote` | quotes.ts | `quotes.OrderQuote` |
| `OrderQuoteBody` | quotes.ts | `quotes.OrderQuoteBody` |
| `OrderQuoteLine` | quotes.ts | `quotes.OrderQuoteLine` |
| `OrderReviewCreate` | orders.ts | `orders.orders.ReviewBody` |
| `OrderSendToRefiner` | orders.ts | `orders.orders.SendToRefinerBody` |
| `OrderSpot` | orders.ts | `orders.spots.Row` |
| `OrderSpotWrite` | orders.ts | `orders.spots.Write` |
| `OrderSpotsPut` | orders.ts | `orders.spots.PutBody` |
| `OrderTotals` | orders.ts | `orders.transactions.Row` |
| `OrderView` | orders.ts | `orders.orders.View` |
| `OrderViewItem` | orders.ts | `orders.items.ViewItem` |
| `OrderViewPayout` | orders.ts | `exchange.payouts.OrderView` |
| `OrderViewProduct` | orders.ts | `products.bullion.Public` |
| `OrderViewShipment` | orders.ts | `shipping.shipments.View` |
| `OrderViewUser` | orders.ts | `auth.users.Summary` |
| `PaymentAttempt` | payments.ts | `payments.attempts.Read` |
| `PaymentDetails` | payments.ts | `payments.details.Read` |
| `PaymentIntent` | payments.ts | `payments.intents.Read` |
| `Payout` | payouts.ts | `exchange.payouts.Read` |
| `PayoutDetails` | payouts.ts | `exchange.payouts.Details` |
| `PayoutPatch` | patches.ts | `exchange.payouts.Patch` |
| `ProductCreate` | products.ts | `products.bullion.New` |
| `ProductPatch` | products.ts | `products.bullion.Patch` |
| `ProfitBreakdown` | quotes.ts | `quotes.ProfitBreakdown` |
| `ProfitCategoriesDict` | quotes.ts | `quotes.ProfitCategoriesDict` |
| `ProfitMetal` | quotes.ts | `quotes.ProfitMetal` |
| `ProfitMetalsDict` | quotes.ts | `quotes.ProfitMetalsDict` |
| `PurchaseOrderQuote` | quotes.ts | `quotes.PurchaseOrderQuote` |
| `PurchaseOrderQuoteBody` | quotes.ts | `quotes.PurchaseOrderQuoteBody` |
| `PurchaseOrderQuoteLine` | quotes.ts | `quotes.PurchaseOrderQuoteLine` |
| `PurchaseQuoteItem` | quotes.ts | `quotes.PurchaseQuoteItem` |
| `PurchaseQuoteProduct` | quotes.ts | `quotes.PurchaseQuoteProduct` |
| `PurchaseQuoteScrap` | quotes.ts | `quotes.PurchaseQuoteScrap` |
| `QuoteItem` | quotes.ts | `quotes.QuoteItem` |
| `Rate` | rates.ts | `rates.rates.Read` |
| `RateInput` | rates.ts | `rates.rates.New` |
| `RatePatch` | rates.ts | `rates.rates.Patch` |
| `Refiner` | refiners.ts | `refiners.refiners.Read` |
| `RefinerItem` | refiners.ts | `refiners.items.Row` |
| `RefinerItemPatch` | patches.ts | `refiners.items.Patch` |
| `RefinerOrder` | refiners.ts | `refiners.orders.Row` |
| `RefinerOrderPatch` | patches.ts | `refiners.orders.Patch` |
| `RefinerSpot` | refiners.ts | `refiners.spots.Row` |
| `RefinerSpotWrite` | patches.ts | `refiners.spots.Write` |
| `Review` | reviews.ts | `reviews.reviews.Row` |
| `ReviewPatch` | reviews.ts | `reviews.reviews.Patch` |
| `SalesOrderQuote` | quotes.ts | `quotes.SalesOrderQuote` |
| `SalesOrderQuoteBody` | quotes.ts | `quotes.SalesOrderQuoteBody` |
| `SalesOrderQuoteLine` | quotes.ts | `quotes.SalesOrderQuoteLine` |
| `ScheduleFulfillmentDirectBody` | fulfillments.ts | `fulfillments.directs.New` |
| `ScheduleFulfillmentPickupBody` | fulfillments.ts | `fulfillments.pickups.New` |
| `SendOrderEmailBody` | media.ts | `media.emails.SendBody` |
| `Shipment` | shipping.ts | `shipping.shipments.Row` |
| `ShipmentPatch` | patches.ts | `shipping.shipments.Patch` |
| `ShipmentPickup` | shipping.ts | `shipping.pickups.Row` |
| `ShippingCancelLabelBody` | shipping.ts | `shipping.shipments.CancelBody` |
| `ShippingCancelPickupBody` | shipping.ts | `shipping.pickups.CancelBody` |
| `ShippingCheckPickupBody` | shipping.ts | `shipping.pickups.CheckBody` |
| `ShippingGetLocationsBody` | shipping.ts | `shipping.shipments.LocationsBody` |
| `ShippingGetRatesBody` | shipping.ts | `shipping.shipments.RatesBody` |
| `ShippingGetTrackingBody` | shipping.ts | `shipping.tracking.Body` |
| `ShippingValidateAddressBody` | shipping.ts | `shipping.shipments.ValidateAddressBody` |
| `SpotPrice` | spots.ts | `spots.spots.Read` |
| `TrackingEvent` | shipping.ts | `exchange.tracking_events.Row` |
| `UpdateCreditBody` | users.ts | `auth.users.CreditBody` |
| `UpdatePaymentIntentBody` | payments.ts | `payments.intents.UpdateBody` |
| `User` | users.ts | `exchange.users.Read` |
| `UserAddress` | address.ts | `places.user_addresses.Read` |
| `UserAddressWrite` | address.ts | `places.user_addresses.Write` |

## The consumers

| | files touched |
|---|---|
| `api/` | 120 |
| `frontend/` | 59 |

Mechanical, by codemod, then by hand where the codemod could not be right:

- **`export type { X } from "@dorado/contracts"` cannot re-export a namespace
  member.** 20 files carried one; each became an import plus a local alias, and
  then four of those aliases turned out to be duplicates `lint:type-homes`
  refuses — `Direction` in three files, `OrderView` in two, `CarrierHandoff` and
  `CarrierServiceOption` in two each. They were re-exports of a contract type,
  which is the hop the contract exists to remove, so they are gone and their one
  consumer (`domain/orders/rules.ts`) reads `providers.CarrierHandoff` directly.
- **`type Category = fulfillments.MethodsRow["category"]`** was an ACCEPTED
  duplicate in `lint-type-homes.ts` whose own reason said "THE CONTRACT IS
  ALREADY THE HOME". The alias is gone from both files and the ACCEPTED entry
  with it — the map is pinned from both sides, so it had to go.
- **Namespace collisions**: seven api files already bound `orders`, `products`,
  `tax`, `shipping`, `quotes` or `rates` as a repo namespace. Those take the
  project's convention, `<name>Contract`.
- **Two frontend fixtures set `variant_label: null`** against a NOT NULL column.
  The old flat `Bullion` declared it nullable and the table does not; the
  contract now says so and the fixtures were corrected. `features/addresses`'
  blank-address template had `created_at: null` for the same reason —
  `places.addresses` timestamps are NOT NULL where `exchange.addresses`' were
  not.

## Verification

| step | result |
|---|---|
| `contracts generate` + `build` | exit 0 — 90 entities, 26 generated barrels |
| `contracts verify:fresh` | **exit 1 — one file**, see the drift note below; every other region matches |
| `contracts validate` | exit 0 — 37/37 exchange tables with data parse clean |
| `api lint:contracts-derived` | exit 0 — 119 files walked, 0 findings |
| `api lint:contracts-derived --self-test` | exit 0 — 6 cases, both directions |
| `api lint:script-guards` | exit 0 — 62 scripts, 25 self-tests run |
| `pnpm check:fast` | PASS — 15 members, api tests 1168/1168 |
| `api validate:wire` | exit 0 — 28 shapes match, 0 diverge, 3 skipped |
| `frontend typecheck` | exit 0 |
| `frontend test` | exit 0 — 220/220 across 39 files |

## The one red verification, and it is not this lane's

`verify:fresh` reports `checkout/checkouts.ts` differing from the database.
Between this lane's first generation and its last, **the shared remote dev
database lost `checkout.checkouts.package_weight` and `declared_value`** —
another lane dropped them there. Measured: every LOCAL per-branch test database
(`test_tx_owner`, `test_streamline_a`, `test_tests_lane_*`, eight of them) still
has both columns, and this branch's `api` reads them in seven places
(`domain/orders/place.ts`, `domain/orders/rules.ts`, the checkout repo and three
tests), so this branch's migration chain still has them.

**The contract keeps them.** Following dev would have baked another lane's
unmerged schema change into the contracts and broken seven api sites this branch
has no migration for. The generated region is the one this branch's migrations
produce; `verify:fresh` flags the difference, which is the guard working. It
goes green when the other lane's migration merges (or is reverted) — no other
region drifted, so the whole disagreement is those two columns.

## Left for later

- The two `.extend()`s on `products.bullion.Storefront` are a join the API still
  performs. When the products read pivots to serving rows, they go and the
  client maps `metal_id`/`mint_id` against `/metals` and `/mints`.
- `exchange.payouts` still holds the payout contracts (`Read`, `Details`,
  `Patch`, `OrderView`) because that is the table the feature reads. They move
  to `payments.details` when the payouts read pivots.
- `rates.rates.Read` is now sourced from the LIVE `rates` schema rather than
  `exchange.rates`; the two are column-identical for every field the read keeps,
  so no consumer type changed.
