# One pricing domain (rulings 75, 76, 78)

Jacob, on `quotes/service.ts`'s `purchaseTotal`: *"Shouldn't this be coming from
pricing domain? … what's going on between pricing/quotes? Aren't these supposed
to be doing the same things..? I just want a centralized domain the rest of our
app could call to get pricing stuff. Not a billion fuckin functions and
calculations lol."*

Then, on the shape of the code underneath it (ruling 78): *"that
calculateSalesOrder dictionary thing is tragic to look at. We shouldn't be doing
anything like that ever… I wonder if you're putting too much weight on existing
code. The only thing we care about from legacy code is the logic (and even then
not entirely). The code itself? Fully comfortable throwing away."*

So this is not a move of files. The logic survived; none of the code did.

## The public surface

`api/domain/pricing/index.ts` is the only way in. Five functions:

| function | answers |
| --- | --- |
| `priceCheckout(checkout_id, tx?)` -> `CheckoutQuote` | the basket, in whichever direction the row says |
| `priceOrder(order_id, tx?)` -> `OrderPricing` | a placed order: lines, re-tier, totals, payable |
| `priceProduct(bullion_id, side, quantity?, tx?)` -> `ProductQuote` | one catalogue product, ask or bid |
| `spots(tx?)` -> `SpotPrice[]` | the live feed |
| `profitBreakdown({ order_id })` -> `ProfitBreakdown` | the admin margin split |

`api/domain/pricing/rules.ts` exports two throws and nothing else
(`assertPriced`, `assertPriceable` - ruling 65: throws live in `rules.ts`).
Seven exported functions in the whole domain, against a target of ten.

## Every number is a SQL read

Four `.sql` files under `api/db/pricing/sql/` hold all of it, and each returns
ONE `jsonb_build_object` that the repo parses through its contract (ruling 71 -
a view is one SQL read; `packages/contracts/src/pricing/` is where the shapes
live):

| read | what it computes |
| --- | --- |
| `product_quote.sql` | `content x spot x premium` for one product, ask or bid, and refuses a hidden product on the ask side |
| `purchase_quote.sql` | per-line bid price, the rate band the WHOLE basket's ounces earn, the payout method's `flat_fee`, the insurance ceiling, the estimated payout |
| `sale_quote.sql` | per-line ask price, the sales-tax rule the delivery state matches, the service row's shipping price, credit clamping, the surcharge the payment method row advertises, the payment surface |
| `order_pricing.sql` | frozen-or-live bids, the stored `orders.items.price` when finalised, the re-tier plan, scrap/bullion totals, shipping, payout fee, total, declared value |

The inputs are rows, not constants:

- the **surcharge** is `payments.methods.surcharge_percent` (ACH 0.005, CARD
  0.029), not an `if (method === "ACH")` in TypeScript;
- the **payout fee** is `payments.methods.flat_fee` (WIRE 20), not the
  `PAYOUT_METHOD_FEES` map, which is how the quote and the placement used to
  disagree in principle even while their numbers happened to match;
- the **shipping charge** is `shipping.services.price`, not the 25/50 literals
  `getShippingCharge` carried - only the $1000 free-shipping threshold and
  Stripe's $0.50 minimum are still numbers in the SQL, because no row holds
  them;
- the **rate band** is a `LATERAL` over `rates.rates` keyed by `metal_id`,
  ordered to reproduce `getRateBand` exactly: a containing band wins (lowest
  `min_qty` first, so a total sitting on a boundary takes the lower band, as
  `bands.find` did); below every band takes the lowest; above every band - or in
  dev's real gap between 20 and 23 oz of gold - takes the highest;
- the **sales-tax rule** is a `LATERAL` over `tax.sales_tax_rules` with the same
  eight predicates `applicable()` used and an `ORDER BY` that is
  `specificity()`'s boolean vector, DESC, then `id ASC` - which is what the JS
  pairwise maximum computed.

**The tax comparison is cast, and that closes D39 on this path.**
`tax.sales_tax_rules.metal_category` and `.product_type` are Postgres enums;
comparing them to a product's text raises **22P02** for a value that is not a
label, which is exactly the failure D39 predicted. The SQL compares
`r.metal_category::text`, so a corrupt product type no longer throws the whole
tax calculation - it simply matches no rule.

## What died

**39 exported functions across 9 files became 7.**

Deleted outright: `domain/pricing/ask.ts` (`calculateItemAsk`,
`calculateCardCharge`, `calculateItemTotals`, `getShippingCharge`,
`calculateSalesTax`, `calculateSalesOrderTotal`), `domain/pricing/bid.ts`
(`inboundShipment`, `effectivePayoutFee`, `recordedContent`, `unitContent`,
`unitsOf`, `unitPrice`, `linePrice`, `itemsTotal`, `scrapLines`,
`bullionLines`, `calculateTotalPrice`, `calculateReturnDeclaredValue`),
`domain/pricing/content.ts`, `domain/pricing/spot.ts`, the whole of
`domain/quotes/` (`catalogQuote`, `priceSaleCheckout`, `checkoutQuote`,
`orderQuote`, `bidPrice`, `requireMetalName`, `estimatedPayout` and five
asserts), `domain/rates/utils/resolveRate.ts` (`getRateBand`, `getRatePct`,
`sumContentByMetal`), and from `domain/orders/rules.ts` `retierPlan`,
`lineContent`, `rateMaterialFor`, `saleLines`, `catalogueWanted`,
`pricedSaleLines`.

`fineContent` moved to `api/shared/utils/convertWeights.ts` beside
`convertTroyOz`, because it is a weight fact (`weight -> troy oz x purity`) that
row builders write into a `content` column, not a price.

`domain/quotes/profit.ts` moved to `domain/pricing/profit.ts` with its five
imported helpers re-inlined as file-local ones. **Its logic was NOT rewritten
into SQL** - it is a three-party margin report over an order, its refiner's
assay and two spot feeds, and porting it is its own lane. It is one export and
does its arithmetic inside the pricing domain, which is where the rule puts it.

**Which premium an order line prices at, and why the two directions differ.**
`order_pricing.sql` takes `COALESCE(stored_premium, retier_premium, 0)`: the
line's own `orders.items.premium` wins and the band is offered separately as
`retier_premium` for `retierPremiums` to write. That is deliberate - an admin
who edits a line's premium by hand is not re-tiered (`retiersAfterEdit` returns
false for a premium edit), so a `priceOrder` that preferred the band would
silently overrule the admin AND make `finalizePricing` write a price that
disagrees with the line's own premium column. `purchase_quote.sql` does the
opposite - the band wins over the stored value - because a BASKET has not been
placed yet and the quotes lane already ruled that its premium is redone live so
the quote is never stale against what placement will charge. Both match what
the code did before.

## The callers

Every one of them now asks the public surface for the number and does no
arithmetic of its own.

| caller | was | is |
| --- | --- | --- |
| `orders/place.ts` `placeSale` | `getSpotPrices` + `saleLines` + `attachSalesTaxToItems` + `calculateSalesOrderTotal` + `pricedSaleLines` | `priceCheckout(checkout.id)`, then the quote's own lines become `SoldLinePrice[]` |
| `orders/service.ts` `retierPremiums` | `listRates` + `pricedLinesFor` + `retierPlan` | `priceOrder(...).items[].retier_premium` |
| `orders/service.ts` `finalizePricing` | `unitPrice(line, bids)` per line + `calculateTotalPrice` | locks the spots first, then writes `priceOrder(...)`'s `unit_price` and `total` |
| `payments/service.ts` `updatePaymentIntent` | `quotesService.priceSaleCheckout(subject)` | `priceCheckout(basket.id)` |
| `checkout/service.ts` `replaceItems` | `basketRows(..., rates, ...)` computed the rate premium | writes the rows, then stores `priceCheckout(session.id, tx)`'s per-line premium |
| `checkout/service.ts` `purchaseTotal` | `bidPrice` over the basket | deleted; its two callers ask `priceCheckout` |
| `shipping/labels.ts` `sealForPlacement` | `checkoutService.purchaseTotal` | `priceCheckout(checkout_id, tx).total` |
| `shipping/operations/service.ts` | `checkoutService.purchaseTotal` | same |
| `media/pdfs/**` | a `Bids` map threaded through every row builder | `priceOrder(order_id)`'s `OrderPricing` |
| `refiners/items/service.ts` | `fineContent` from pricing | `fineContent` from `#shared/utils/convertWeights.ts` |

## Two divergences the merge settled

Two pairs of functions were computing the same customer-visible number
differently. One answer had to win, and the money-writing path won both times.

1. **An unlocked order's bids.** `orderQuote` preferred the FROZEN
   placement-time bid and fell back to live; the PDF used LIVE whenever
   `spots_locked` was false. `finalizePricing` refreshes the frozen rows from
   live before it prices, so the business rule is "the price floats until it is
   locked" - the PDF was right. `priceOrder` uses frozen when `spots_locked`,
   live otherwise. In a test the two are the same value, because the feed does
   not move mid-test; in production it is the difference between a live quote
   and a stale one.
2. **A scrap line with no premium.** `orderQuote` defaulted it to `1` (full
   spot), `unitPrice` to `0`. `finalizePricing` writes the money with `0`, so
   the quote was previewing a number the order would never pay. `priceOrder`
   uses `0`. Dev holds exactly one such line out of 88.

## Wire changes (ruling 44 - the frontend informs nothing, and is not updated here)

- `GET /api/quotes/checkout?direction=` returns `CheckoutQuote`, a
  **discriminated union on `direction`** of `PurchaseQuote` and `SaleQuote`.
  Both gained `direction` and `checkout_id`; sale lines gained `premium`,
  `metal`, `content`, `kind`, `bullion_id` and their own `sales_tax`; the sale
  quote gained `shipping_service`, `sales_tax_state` and `unpriceable`.
- `POST /api/quotes/catalog` prices **one** product: the body is
  `{ bullion_id, side, quantity? }` and the answer is `ProductQuote`. It used
  to take a list. **This is a real trade and it is listed on purpose**: a
  storefront grid now needs one request per card (react-query caches and dedupes
  per id, and the old whole-grid key refetched everything on every tick anyway).
  The right long-term home for a grid's prices is the product read itself, not a
  quote endpoint; that is follow-up work, not this lane's.
- `POST /api/quotes/order` returns `OrderPricing` in place of `OrderQuote` -
  same numbers plus `direction`, `spots_locked`, per-line `metal`, `content`,
  `quantity`, `retier_premium`, and `items_total`/`shipping_charge`/
  `payout_fee`/`declared_value`.
- `POST /api/tax` is **deleted**, with `attachSalesTaxToItems`, `getSalesTax`,
  `factsFrom`, `rateForItem` and `domain/sales-tax/match.ts`. It took a list of
  items in the body (ruling 43), had no client in `@dorado/client` or the
  frontend, and its answer is a field of the sale quote now.
  `domain/sales-tax` keeps `isNexus`, `allRules` and `updateStateSalesTax`.
- `@dorado/client`: `useCatalogQuote(items, side)` is
  `useProductQuote(bullion_id, side, quantity?)`; `useOrderQuote` is
  `useOrderPricing`; `useCheckoutQuote` returns `CheckoutQuote`.
  `keys.quotes.catalog` keys by id instead of a JSON blob.
- `transport/quotes/` is `transport/pricing/`. **The paths do not change**
  (ruling 13) - the router is still mounted at `/api/quotes`.

## Ruling 76 - the defaults live in the database

Migration `131_product_defaults_live_in_the_database.sql`.

Jacob first: *"I believe defaults should be living in the database. Need to add
a migration to make it so."* Then, on the three hardcoded uuids: *"Should be a
way to do this without a hardcode."*

So `NEW_PRODUCT_DEFAULTS` is deleted and **nothing replaced the three ids**.
`products.bullion.metal_id`, `.mint_id` and `.supplier_id` are already
`NOT NULL` with no default, so the database already refuses a create that omits
them - the admin decides all three, and no SQL function guesses. (The dev ids
the constant carried resolved to metal *Silver*, mint *Elemetal*, supplier
*Elemetal*. Production has no `products` schema at all, so there is nothing
there to match - see the deploy hazard in CLAUDE.md.)

`image_front` and `image_back` were `/product_images/elemetal_products/silver/
Product Name/FRONT.png` - a placeholder with a literal "Product Name" segment
and a baked-in metal, not a template anything could fill. They get
`DEFAULT ''::text` instead, the same empty-state convention the table already
uses for `name`, `variant_group` and `created_by`; the upload sets the real
path.

`stock` and `quantity` are **dropped** (Jacob: "Yes"). Measured read-only
before the drop, on dev's 62 rows, so the values survive in writing even though
the columns do not:

| id | name | stock | quantity |
| --- | --- | --- | --- |
| `78ac9ec1-165d-401c-81f5-da07f922356a` | 1oz (.45 ACP) Silver Bullet | 0 | 1 |
| `71e5420c-9918-44f7-b87b-3b8c57a02670` | 1oz Silver Elemetal Round | 16 | 18 |

Every other row held zero in both. `products.bullion` is a native-schema table,
not `exchange`; the covenant's frozen tables are untouched.

The create is now four columns:

```sql
INSERT INTO products.bullion (name, metal_id, mint_id, supplier_id)
VALUES ($1, $2, $3, $4)
RETURNING id
```

## The gate

`pnpm --filter @dorado/api lint:pricing-owner` (in `check.mjs`'s `api-lint`
group, `--self-test` with 12 cases) fails two things anywhere under
`api/{db,domain,transport,shared,providers,scripts}` outside
`api/domain/pricing/**`:

1. a `*` whose left or right operand names money - an identifier or member chain
   whose last segment contains `price`, `premium`, `content`, `spot`, `ask`,
   `bid`, `fee` or `tax` as a word (camelCase and snake_case are split, a
   trailing `s` is allowed, so `unit_price`, `cardFee`, `spot.bid` and `taxes`
   all count and `width * height` does not);
2. an import of `#domain/pricing/anything` other than the public
   `#domain/pricing/index.ts`.

Comments, strings and template literals are blanked before the arithmetic scan,
`tests/` is excluded, and the run refuses to report a clean tree if it scanned
fewer than 300 files or if its own planted control sample stops producing
findings.

## Tests

The money assertions did not change; where they lived did.
`domain/pricing/tests/` holds four files:

- `payout-quote.test.ts` - the purchase quote's two deductions, ported
  one-for-one from `domain/quotes/tests/payout-quote.test.ts`, plus a line-level
  `content x bid x premium` check.
- `sale-settlement.test.ts` - every assertion from
  `domain/payments/tests/surface.test.ts` (which is deleted), now against a real
  sale basket: no balance is a card, a covering balance is credit, a surplus is
  still credit, and a sliver below Stripe's minimum is held back so exactly
  $0.50 is charged. Plus: the surcharge equals the payment method row's own
  `surcharge_percent`, and a line prices at `content x ask x ask_premium` and
  totals by quantity.
- `rate-bands.test.ts` - what `domain/orders/tests/rules.test.ts`'s `retierPlan`
  cases proved, against dev's real gold bands: every line takes the band the
  WHOLE basket earns, scrap and bullion read different columns of it, below the
  lowest takes the lowest, above the highest takes the highest.
- `sales-tax.test.ts` - no address is no tax; the delivery address's state is
  what reaches the rules and charges what the rule says; and the price a line is
  taxed on comes from `spots.spots`, which no request can write (the protection
  `domain/sales-tax/tests/server-spots.test.ts` used to hold).
