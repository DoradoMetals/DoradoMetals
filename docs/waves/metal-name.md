# Metal is its name (ruling 79)

Jacob, 2026-09-06: "thoughts on making the metal_id the actual name? So we
don't have to do the weird shit with joins and such." Then: "We could just
replace the ids with the metal names, and get rid of the name column." A
cascade on rename is fine (his call); metals are a fixed vocabulary of four
(Gold, Silver, Platinum, Palladium) that nothing customer-created touches.

## The shape

`metals.metals.id` becomes `text PRIMARY KEY` holding the name; the `name`
column goes. Every `metal_id` column keeps its NAME and becomes
`text REFERENCES metals.metals(id) ON UPDATE CASCADE`, holding 'Gold' and
friends. No column is renamed anywhere, so the change is a type and a value,
not a sweep. Any join that existed only to read the metal's name dies: the id
is the name.

## Migration 132 (nothing in `exchange` moves)

Eight tables carry `metal_id uuid`: `products.bullion`, `checkout.items`,
`orders.items`, `orders.spots`, `rates.rates`, `refiners.items`,
`refiners.spots`, `spots.spots`. In one migration:

1. Drop the eight FKs to `metals.metals(id)`.
2. `metals.metals`: add the text id from `name`, swap the primary key, drop
   the uuid and `name`.
3. Each of the eight: `ALTER COLUMN metal_id TYPE text USING (select the name
   for the uuid)`; `NOT NULL` stays exactly where it was.
4. Re-add the eight FKs `REFERENCES metals.metals(id) ON UPDATE CASCADE`.
5. Constraints and indexes that lead with `metal_id` keep working
   (`spots_one_per_metal`, `rates_no_overlap_qty` with `metal_id WITH =`);
   confirm with `audit:indexes`, `audit:query-paths`, `audit:constraints`.

`migrate` against dev, regenerate `000_genesis_schema.sql`, regenerate the
contracts (`metal_id: z.string()`; `Metal` is `{ id }` plus whatever
attributes remain). `lint:migrations` green: no exchange write.

## Backfills

Every backfill that resolved `metal_id` through a name lookup now copies the
name (`029` catalogue, `031` orders, spots, rates, refiner spots). They must
reproduce dev exactly: `verify:backfill` is in the gate and must stay at zero
undeclared differences; `verify:genesis` must pass.

## Code

Drop every join whose only purpose was the metal's name (pricing reads, the
order view, checkout item lists, refiner reads, pdf and email inputs, the
`metalNames` map in `checkout/rules.ts`). Rewrite from the inputs inward
(ruling 78). Tests and builders pass names where they minted metal rows.
`validate:wire` green.

## Not in scope

Mints and everything customers create keep their ids. Frontend untouched
(its breakages listed in the doc). `exchange` untouched.

## Result (executed 2026-09-06)

### The migration

`132_the_metal_is_its_name.sql`, applied to dev only. Eight tables converted:
`checkout.items`, `orders.items`, `orders.spots`, `products.bullion`,
`rates.rates`, `refiners.items`, `refiners.spots`, `spots.spots`. No column was
renamed; each `metal_id` is `text REFERENCES metals.metals(id) ON UPDATE
CASCADE`, NOT NULL exactly where it was (`checkout.items` stays nullable,
`products.bullion` keeps its `ON DELETE RESTRICT`). `metals.metals` is
`id text PRIMARY KEY` and `name` is gone; `metals_name_key` went with it.

**The eight conversions are `ALTER COLUMN ... TYPE text USING metals.name_of
(metal_id)`, not an UPDATE, and that is the whole point.** The first version of
132 converted to text and then UPDATEd each table to the name. That fires the
`audit_stamp` trigger (116): dev's 62 products and 16 rates came out with
`updated_at` rewritten to the moment the migration ran, and `verify:backfill`
caught all 78 as undeclared drift. A type change is not an edit. The values are
mapped inside the `USING` clause by a plpgsql function created and dropped in
the migration — plpgsql because a SQL function would be inlined into the
subquery that `USING` refuses, and a function rather than hard-coded uuids
because dev's and production's are different. Dev's `updated_at` was restored
from `exchange` with the trigger disabled, and 132 reconciled.

`spots_one_per_metal` (UNIQUE) and `rates_no_overlap_qty` (EXCLUDE USING gist,
`metal_id WITH =`) rebuilt themselves on the type change; btree_gist covers
text as it covered uuid. `audit:indexes`, `audit:query-paths` and
`audit:constraints` are green. `metals.exchange_compat` was dropped and rebuilt
(`CREATE OR REPLACE` cannot change a column's type); it now answers the name as
both `id` and `type`.

### The joins

**17 joins deleted from `api/db/**/sql/`** — the id is the name, so nothing
needs `metals.metals` to read it:

| where | reads |
|---|---|
| `db/spots/sql/get_all.sql` | the whole spot feed |
| `db/orders/spots/sql/` | `get_for`, `get_many` DELETED (the PUT now answers the same rows the GET does); `get_rows_for` lost its join and its `ORDER BY m.name` |
| `db/refiners/spots/sql/` | `get_for`, `get_many`, `get_named` DELETED; `get_for_order.sql` is new (the one read profit needs); `get_for_engagement` lost its join |
| `db/orders/items/sql/priced_lines.sql` | DELETED — dead since the pricing lane, and its only content was `m.name AS metal` |
| `db/products/sql/list.sql`, `get_admin.sql` | `metal_type` / `metal` are `metal_id` |
| `db/rates/sql/get_all.sql`, `get_one.sql`, `get_admin_all.sql` | `metal` is `metal_id` |
| `db/pricing/sql/purchase_quote.sql`, `sale_quote.sql`, `order_pricing.sql` | the `metal` column beside `metal_id` is gone; the sales-tax rule match now compares `l.metal_id` |

**5 more deleted from the backfills**, and **25 from tests and
`validate-wire.ts`.**

`db/metals/repo.ts` lost `namesById` and `idsByName`: both were the identity
map. `DocumentLabels.metals` is a `string[]` rather than a
`Map<id, name>`; `pricing/profit.ts` lost its `metals` map, its `idOf`
inversions and one parameter from three functions.

### The backfills

`029` writes `metals.metals (id)` from `exchange.metals.type` and takes
`spots.spots.metal_id` from the same column; `products.bullion` and
`rates.rates` join `exchange.metals` for the name rather than copying the uuid.
`028`, `031`, `064`, `066` do the same for the order and refiner lines; `036`,
`070`, `083`, `088` drop the `JOIN metals.metals mt ON mt.name = m.type` and
use `m.type` directly. `117`'s `metals_name_key` block was removed — the column
it constrained no longer exists, and a fresh production build would have failed
on it after genesis. `verify:backfill` reports **no undeclared differences**;
`verify:genesis` reports the committed genesis matches dev.

### Wire changes (the frontend is NOT updated here — ruling 44)

- `Metal` is `{ id }`. `GET /api/metals` answers names.
- `SpotPrice` / `SpotTicker` lost `name`; `id` is the metal.
- `BullionStorefront` lost `metal_type`; `BullionAdmin` keeps `metal_id` and
  lost `metal`. `GET /api/products?metal=Gold` is `?metal_id=Gold`.
- `RateRead` / `AdminRate` keep `metal_id` and lost `metal`; `RateTier.metal`
  is `RateTier.metal_id`.
- `PurchaseQuoteLine`, `SaleQuoteLine`, `OrderPricingLine` lost `metal`.
- `GET`/`PUT /api/orders/:id/spots` answer `OrderSpot` rows — `metal_id`,
  `scrap_percentage`, `bullion_percentage` — where the PUT used to answer
  `name` plus two always-null change columns. `OrderSpotNamed` and `PricedLine`
  are deleted from `@dorado/contracts`.
- `@dorado/client`'s `ProductQuery.metal` is `metal_id`.

### Frontend breakages (out of scope, listed per ruling 44)

**34 files.** The shapes above; the recurring ones are `spot.name` in every
drawer header and footer that renders the spot strip
(`features/orders/**/[purchase|sales]Order*Drawer*`, `features/spots/ui/
Spots.tsx`, `features/products/ui/{BullionCard,ProductCard,ProductDrawer,
ProductPageDetails,MobileProductCarousel}.tsx`), `metal_type` in
`features/checkout/items/flair.ts` and `ProductPageDetails.tsx`, `tier.metal`
in `app/rates/page.tsx` and `features/rates/{types.ts,ui/RatesCard.tsx,
ui/RatesAdminTable.tsx}`, the name/id lookups in `features/orders/display.ts`
(`metalNameOf` becomes the identity), `features/scrap/{types.tsx,ui/ScrapTab.tsx,
ui/ReviewStep.tsx}`, `AdminReceived.tsx`, `editRefinerValues.tsx`,
`editActualValues.tsx`, and the `metal` filter key in
`shared/store/productFilterStore.ts` + `features/products/queries.ts`.

### Files touched

109 in the API, contracts and client (101 modified, 6 SQL reads deleted, 2
added). `scripts/lib/feature-map.ts` maps `exchange.metals.type -> id` and
declares `exchange.metals.id` deliberately dropped; `verify-backfill.mjs`
compares `metals.metals` on `id` alone and keys `orders.spots`' population by
the name.
