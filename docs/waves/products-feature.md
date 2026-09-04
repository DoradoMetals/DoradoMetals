# products, mints, metals, spots, rates — the feature end to end

Jacob's brief, the same one orders, checkout and fulfillments ran under:
*"Start rolling through features on the API, get rid of any types that are
present. Figure out how to get rid of any prop spreading. Resources come from
the server (unless they really can't). … Look at the frontend counterparts at
the same time. Is there business logic on the frontend? Remove it to the API."*

Five features, one lane, because they are one sentence asked five ways: **what
is a bar of metal worth right now.** `products` is the catalogue, `metals` and
`mints` are what a catalogue row points at, `spots` is the live price of the
metal in it, and `rates` is the share of that price the business pays.

---

## 1. What moved server-side

Every one of these was a decision about the business, taken in a browser.

| the rule | where it was | where it is |
|---|---|---|
| which products are a FAMILY, and which member is the headline row | `groupProducts` in `features/products/types.ts`, then a `sort((a,b) => b.content - a.content)[0]` re-done in **four** components — which disagreed with the grouping about which row was the default | `rules.group` → `BullionGroup` |
| the ORDER a family's sizes are offered in | the same `sort` again, four times | `rules.group`, heaviest first |
| the sell tab's metal filter | `bullionProducts.filter(p => p.default.metal_type === selected)` | `GET /products?metal=` |
| the sell tab's SEARCH | `fuzzysort` over a `${name} ${metal_type}` string rebuilt per keystroke, over the whole catalogue | `GET /products?search=` — matches the name, the variant, the shape or the metal |
| the generic/branded split | `filter(g => g.default.is_generic)` with the sense inverted from its own switch label | `GET /products?generic=` |
| the homepage selection, the buy gate, the sell non-gate | three separate endpoints | `?placement=` and `?side=`, one endpoint |
| which way a metal moved today | `(spot.dollar_change ?? 0) >= 0` in **two** tickers — which painted a flat day green with an up caret | `rules.trendOf` → `SpotTicker.direction` (`up`/`down`/`flat`) |
| the rates page's whole table | ~90 lines in `app/rates/page.tsx`: group by metal, dedupe bands by (min, max, unit), prettify the unit, format "1–10 oz" / "50+ oz", sort the columns, pad to four | `rules.tiers` → `RateTier[]` |
| the "up to" percentage on the landing strip | `topRatesByMetal` + a `Math.max(scrap_pct, bullion_pct)` beside it, a SECOND implementation of the same search | `RateTier.top_pct` |
| the rate BAND for a weight | `frontend/features/rates/utils/resolveRate.ts` — `getRateBand`, `getRatePct`, `sumContentByMetal`, kept in step with the API's copy by `api/shared/tests/mirror.test.ts` because *"one quotes a customer a payout rate and the other pays it"* | **deleted.** Nothing in the browser called any of the three; every rate a customer sees comes from a `/quotes` endpoint. One copy is not a mirror, so the pair left `mirror.test.ts` with the file |
| a spot looked up by its metal's NAME | `spotPrices.find(s => s.name === product.metal_type)` — a string comparison across two independent reads, in three components | `BullionStorefront.metal_id`, matched by id |

`api/domain/products/rules.ts`, `api/domain/spots/rules.ts` and
`api/domain/rates/rules.ts` hold all of it, pure over rows already loaded,
tested without Postgres.

**One thing deliberately NOT moved.** The cards' "over/under spot" popover line
is still `quoted unit_price − content × spot`, in the browser. The honest home
for it is `CatalogQuoteLine` (a melt and a premium beside the unit price), and
`POST /quotes/catalog` is the quotes lane's file. Left for them.

**One thing deliberately NOT invented.** `stock` is 0 on 61 of dev's 62
products, so an `in_stock` field would render "out of stock" across the whole
storefront on day one. Measured before writing it; not written.

## 2. The composers are gone, and the joins came back

`domain/products/compose.ts`, `domain/spots/compose.ts` and
`domain/rates/compose.ts` each read a reference table into a `Map` and then
re-spelled every column of every row onto a new object — 20 fields in
`storefront`, 30 in `admin`, "one read of each reference table instead of a
join per query." Against four metals, ten mints and two refiners that was a
cost nobody was paying, and it is exactly the prop-spreading the brief names.

All three are deleted. `sql/list.sql` and `sql/get_admin.sql` JOIN
`metals.metals`, `products.mints` and (for the supplier's name, which lives on
its ORGANIZATION) `refiners.refiners` → `organizations.organizations`. Every
join is INNER, which preserves the composers' semantics exactly: all three
foreign keys are NOT NULL, so a product whose reference row vanished is
dropped rather than rendered blank. `spots/sql/get_all.sql` joins the metal and
orders by it; `rates/sql/get_all.sql` joins the metal, which is what finally
lets that read ORDER BY the metal's name instead of sorting in JS.

**`BullionStorefront` KEEPS `metal_id` and `mint_id`** beside the two names.
The old contract dropped them on the way out, which is why three components
matched a spot quote on `name`. It is now a strict superset of `BullionPublic`,
so every consumer typed on the narrower shape kept compiling.

## 3. Eight statements became two

`db/products/` had `get_storefront`, `get_sell`, `get_homepage`, `get_by_slug`,
`get_by_ids`, `get_filtered`, `get_admin_all` and `get_admin_one` — six of them
the same projection under a different `WHERE`, each with its own file and its
own repo function. There is one public statement and one admin statement now,
and the `WHERE` is a `ProductFilter` the repo builds from a closed set of keys
(only placeholder numbers are interpolated; every value is bound). The ordering
is a closed map too, so `?sort=` can never reach the statement as text.

The verbs are `listFor` / `listAdmin` / `getOne` / `create` / `update`, plus
`getLiveness` and `listTypes` — two narrow reads that answer genuinely
different questions (`display` is an admin fact and must not ride on a public
projection; `SELECT DISTINCT type` has no filter on purpose, see D39).

## 4. Wire changes (ruling 44 — the frontend informs nothing)

The verb is the method and the filter is a query param (`docs/waves/rest-routes.md`).

| before | after |
|---|---|
| `GET /products/get_all_products` | `GET /products` → **`BullionGroup[]`** |
| `GET /products/get_sell_products` | `GET /products?side=bid` |
| `GET /products/get_homepage_products` | `GET /products?placement=homepage` |
| `GET /products/get_products` | `GET /products?metal=&category=&type=&search=&generic=&sort=` |
| `GET /products/get_product_from_slug?slug=` | `GET /products/:slug` → **one `BullionGroup`**, 404 when nothing matches |
| `GET /products/get_admin_products` | `GET /products/admin` |
| `GET /products/get_product_types` | `GET /products/types` → **`string[]`** (ruling 12), was `{name}[]` |
| `GET /products/get_metals` | `GET /metals` → `Metal[]`, was the composed spot shape |
| `GET /products/get_mints` | `GET /mints` |
| `POST /products/create_product` | `POST /products` → 201 |
| `POST /products/save_product` `{product:{…,id}}` | `PATCH /products/:id` — a PATCH, not a full replace; naming `id` in the body is a 400 |
| `GET /spots/spot_prices` | `GET /spots` → **`SpotTicker[]`** (`direction` added) |
| `GET /rates/get_all` | `GET /rates` |
| `GET /rates/get_admin` | `GET /rates/admin` |
| `GET /rates/get_one?rate_id=` | `GET /rates/:id` |
| — | `GET /rates/tiers` → **NEW**, `RateTier[]`, public |
| `POST /rates/create` `{rate}` | `POST /rates` → 201, body is the patch |
| `POST /rates/update` `{rate_id,patch}` | `PATCH /rates/:id` |
| `DELETE /rates/delete` `{rate_id}` | `DELETE /rates/:id` → 204 |

**The query string is parsed strictly**, against a zod schema with defaults: an
undeclared filter and a sort nobody offers are both 400s, rather than a filter
silently ignored. `admin-routes.json` was updated by hand in the same diff, as
its own test requires.

## 5. Contracts

Added, all `.pick()`/`.omit()`/`.extend()` of a generated row:
`BullionAdminRow`, `BullionAdmin`, `BullionGroup`, `BullionLiveness`,
`BullionPatchColumns` (the patch minus `id`, which is the UPDATE's WHERE key —
fulfillments' precedent), `SpotPatch`, `SpotTrend`, `SpotTicker`, and
`computed/rates.ts`'s `RateBand` / `RateTier`, declared in
`lint:contracts-derived`'s COMPUTED map because a band's LABEL and its
cross-metal column KEY are not columns of anything.

`computed/spots.ts` was written and then deleted: the lint pins COMPUTED from
both sides, and `SpotTicker` derives cleanly, so it belongs on the entity file.
That is the exception working.

Every local type in this lane's `db/` and `domain/` is gone —
`PublicProductRow`, `AdminProductRow`, `ProductPatch`, `NewProduct`,
`Liveness`, `StorefrontProduct`, `AdminProduct`, `Labels`, `SpotRow`,
`SpotWire`, `RateRow`, `RateWire`, `AdminRateWire`, `MintRow`, `MetalRow` — and
`PATCHABLE` derives from the contract in all three repos (ruling 64).
`domain/products/constants.ts` (four field lists for `exchange.products`, read
by its own test and nothing else) is deleted.

## 6. Ruling 65 — no `throw` in a service

Four throws moved out of `rates/service.ts` (3) and `rates/compose.ts` (1) into
`domain/rates/rules.ts` as `assertRate` / `assertChanged`; the two ACCEPTED
entries came off `lint-no-throw-in-services.ts` rather than being edited around.
`products/rules.ts` and `spots/rules.ts` were written the same way from the
start. `lint:input-shapes`' `Options:ProductOptions` entry went too: the builder
takes `BullionPatch & { metal }` now instead of restating twenty columns.

The lane's `ACCEPTED`/`PENDING` net: **-2** no-throw entries, **-1**
input-shapes entry, **-2** client-boundary PENDING prefixes.

## 7. The client package

`packages/client/src/products/` (9 hooks + `fetchProducts`, the plain fetcher
the sitemap uses on the server), `src/spots/` (1) and `src/rates/` (6), keyed
through `src/keys.ts`.

`features/spots/queries.ts` and `features/rates/queries.ts` are now
**re-exports and nothing else**, kept because ~20 files other lanes own import
those names. `features/products/queries.ts` is two hooks built ON the package
and calling no API: `useProducts` (the whole catalogue FLAT, which is how eight
surfaces map a `bullion_id` onto a picture) and `useSaveProduct` (the admin
drawer's dropdowns hold NAMES and the API takes IDS, so the names are resolved
against the same reference lists the dropdowns render from — admin-form glue
that dies with the interim drawer).

`useProducts` asks the SELL side, which has no `display` gate: an order can
name a product since pulled from the storefront, and that id must still resolve
to a name. The old flat read was gated, so it could not.

## 8. Files outside this lane that had to move with it

Nothing here is a rework — each is a call site of a type or a hook this lane
owns, changed in the same diff because leaving it broken is not an option.

- **`domain/checkout/rules.ts`, `domain/checkout/service.ts`,
  `domain/orders/{place,read,rules,service}.ts`, `domain/quotes/{profit,rules,service}.ts`** —
  `PublicProductRow`/`Liveness`/`StorefrontProduct`/`SpotWire` became their
  contracts, `productsRepo.getByIds(ids)` became `listFor({ ids })`, and
  `ratesService.getAllRates` became `listRates`. One or two lines each.
- **`api/shared/http/tests/endpoints.test.ts`** — its `handlerFor` scanned every
  `routes.ts` for `router.get("/")` and took the first hit, so it attributed
  `GET /api/products/` to **checkout's `getCheckout`**. A route declared as `/`
  carries its path in its MOUNT; the directory resolution that already existed
  underneath now runs first for that case.
- **Frontend, other lanes' files (7)** — `formatRate` moved from the deleted
  `rates/utils/resolveRate.ts` into `rates/types.ts` (5 import swaps);
  `OrderSummary.test.tsx` and `purchaseOrderDrawerFooter.test.tsx` mock
  `@dorado/client`'s two hooks with the rows their `apiRequest` URL branch used
  to answer with — the fulfillments lane's precedent, no assertion changed.

## 9. ADMIN FRONTEND — every file touched, and what was done to it

Admin is frozen while Jacob's agents rework the tables. These are import and
call-shape swaps only; not one of them was redesigned.

| file | change |
|---|---|
| `features/products/ui/AdminProductsTable.tsx` | none needed — `AdminProduct` is now an alias of `BullionAdmin` in `features/products/types.ts`, and `useCreateProduct`/`useAdminProducts` keep their names through the shim |
| `features/products/ui/ProductDrawer.tsx` | **one line**: `options={types?.map(i => i.name)}` → `options={types ?? []}`, because `GET /products/types` answers a bare `string[]` |
| `features/rates/ui/RatesCard.tsx` | **two lines**: `update.mutate({ rate_id, patch })` → `{ id, patch }`, and `del.mutate(row)` → `del.mutate(row.id)` |
| `features/rates/ui/RatesAdminTable.tsx` | none — `useAdminRates` re-exported under its own name |
| `features/orders/salesOrders/…/AdminPreparing.tsx` | **one line**: `useAdminSuppliers` now imports from `features/refiners/queries` (the endpoint belongs to the feature that owns the table) |
| `app/admin/**` | untouched |

## 10. Verification

| gate | result |
|---|---|
| `pnpm check:fast` | PASS but for `figma:inventory` (Jacob's map — red before this lane too) |
| `pnpm --filter @dorado/api test` | 220 files, 1299 passed, 1 skipped |
| `pnpm --filter @dorado/client typecheck` + `test` | 0, 24 passed |
| `pnpm --filter @dorado/frontend typecheck` + `test` | 0, 33 files / 191 passed |
| `pnpm --filter @dorado/api validate:wire` | **33** shapes match (was 27), 0 diverge, 3 skipped for want of a fixture |
| `pnpm --filter @dorado/api audit:query-paths` | clean — 216 literals, 69 filters, every one has an index to enter by |
| `pnpm --filter @dorado/api audit:coverage` | unchanged (1 orphan column, pre-existing) |

Six of `validate:wire`'s shapes are new: the product group, the row inside it,
the admin row, the spot ticker, and all three rate reads. Spots and rates had
**no wire check at all** before this lane — the two reference feeds every price
in the business is built from.

## 11. Left for someone else

- **The melt/premium split belongs on `CatalogQuoteLine`.** Three components
  still compute `unit_price − content × spot` for the "over/under spot" line.
  It is a quotes-lane change (one field on the quote, three deletions here).
- **`useSaveProduct`'s name→id resolution** is the last piece of catalogue
  business logic in the browser, and it is there because the frozen admin
  drawer's dropdowns hold names. It goes when the drawer is rebuilt.
- **`?sort=` is implemented and nothing selects it.** The buy page reads it
  from the filter store; no control sets it yet. Server-side and tested.
- **`features/products/queries.ts` should end up empty.** Both hooks left in it
  are there for consumers this lane does not own.
