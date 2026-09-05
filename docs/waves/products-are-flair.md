# Products are flair; the item carries its facts (ruling 80)

Jacob, 2026-09-06, on `checkout/rules.ts` `snapshot()`: "it would make more
sense for the frontend to call a getProducts endpoint anytime it needs product
visual flair for checkout/orders. Instead of returning the products along with
the checkout/order items rows." Ruling 51 already made the item row carry
every load-bearing fact; the product join on item reads is decoration.

## Reads

- `OrderView.items[]` loses the embedded `bullion` object; an item is its own
  columns plus `bullion_id`, `payable` and `line_total`. `db/orders/sql/view.sql`
  drops the `products.bullion` subselect.
- Checkout item reads (`list_for_order.sql`, `list_for_checkout.sql`,
  `get_one.sql`) drop the `LEFT JOIN products.bullion` and the `coalesce` on
  the metal: the write snapshots it, so a missing snapshot is a bug to surface,
  not hide.
- The frontend resolves name, image, mint and slug from the product list it
  already holds (`@dorado/client` `useProducts`); its call sites are listed in
  the doc, not changed.

## Writes

- A bullion line is `{ bullion_id, quantity }`; a scrap line is the metal and
  the weights. `CheckoutItemPatch` becomes a union of two strict shapes derived
  from `CheckoutItem` with `pick`, so a bullion line carrying weights fails
  parsing at the boundary. `SERVER_OWNED` and its loop go.
- The snapshot is SQL: `db/checkout/items/sql/create_from_product.sql`
  (`INSERT ... SELECT` from `products.bullion`, the way
  `db/orders/items/sql/create_from_product.sql` already works) for bullion
  lines, the plain `create.sql` for scrap. `snapshot()`, `byId`, `metalNames`
  and the `{ row, metal }` return are deleted; whatever consumed `metal` reads
  it from the row (it is a name after ruling 79).
- `replaceItems` becomes: parse, delete the checkout's items, insert each line
  through the right SQL, inside the caller's `tx`. No maps, no dictionaries.

## Rules

Rulings 47-79. No throws outside `rules.ts`; views are one SQL read; no
column arrays; ids from the database; rewrite from the logic. Every lint
self-test and `pnpm check:fast` green except `figma:inventory`.

## Not in scope

Frontend. Runs AFTER ruling 79 (metal is its name) so the snapshot copies the
final column.

## Result (executed 2026-09-06)

### Reads changed, joins deleted

Five joins on `products.bullion` died; two were kept because the product row is
load-bearing at write time, not decoration.

| SQL | what went |
| --- | --- |
| `db/orders/sql/view.sql` | the `'product'` subselect - `OrderView.items[]` is now the `orders.items` row plus `product_name`, `payable` and `line_total` |
| `db/checkout/items/sql/list_for_order.sql` | `LEFT JOIN products.bullion` and `coalesce(i.metal_id, b.metal_id)` |
| `db/orders/items/sql/create_bought.sql` | same join and coalesce - the checkout line's own `metal_id` is written into the order line |
| `db/orders/items/sql/create_sold.sql` | same join and coalesce |
| `db/products/sql/get_liveness.sql` | deleted with its repo and service functions - the liveness gate is a `WHERE` in the snapshot now |

`list_for_checkout.sql` and `get_one.sql` had no join to drop; they already read
the row's own columns.

**Kept, and why.** `db/pricing/sql/sale_quote.sql` joins the product for
`ask_premium`, `type`, `legal_tender` and `domestic_tender` - ruling 51 prices a
sale line from the product's ask premium at the moment it is priced, and the tax
rule matches on the product's own type and tender flags.
`db/pricing/sql/product_quote.sql` prices a catalogue product with no item in
sight. `db/orders/items/sql/create_from_product.sql` IS a snapshot.

### The snapshot is SQL

`db/checkout/items/sql/create_from_product.sql` is new: one `INSERT ... SELECT`
that joins the checkout to its product and copies `gross -> pre_melt`,
`content -> post_melt` and `content`, `purity`, `metal_id`, `unit = 't oz'`.
It reads the checkout's own `direction`, so the sale premium (`b.ask_premium`)
and the buy-side liveness gate (`b.display = true`) are decided in the same
statement rather than passed in. A product that is missing, or hidden from a
sale, matches nothing and the statement returns no row - which
`rules.assertProductAvailable` turns into a 422.

### What died in `checkout/rules.ts`

`snapshot()`, `SERVER_OWNED`, `DECLARED_LOT_REQUIRES`, `requireLiveProducts`,
`notAvailable`, `basketRows` and the `{ row, product }` return - about 90 lines.
The `byId` map went with them (`metalNames` had already gone with ruling 79).
Three functions replace them: `assertCatalogueLine` (a buy basket holds
catalogue products), `assertProductAvailable`, and `scrapLine`, which is the one
place fine content is still derived in TypeScript because there is exactly one
definition of it (`shared/utils/convertWeights.ts` `fineContent`).

`replaceItems` is now: ensure the session, delete its items, and for each parsed
line either insert through `create_from_product.sql` or through `create.sql`,
all inside the caller's `tx`. No maps, no dictionaries, no spreading. A bad line
rolls the whole sync back, which is what the "one bad line refuses the whole
sync" test already asked for.

`checkoutItems.createMany`, `products.getLiveness` and `catalog/products`'
`getLiveness`/`getByIds` had no callers left and were deleted.

### Contract shapes changed

- `CheckoutItemPatch` is `z.union([CheckoutBullionLine, CheckoutScrapLine])`.
  `CheckoutBullionLine` is `{ bullion_id, quantity? }`, strict.
  `CheckoutScrapLine` is `{ metal_id, pre_melt, post_melt?, purity, unit,
  quantity? }`, strict, with the four load-bearing values non-null. A bullion
  line carrying a weight and a scrap line with no metal are both refused by
  `parseStrict` at the transport - **400 now, where they used to be a 422 from
  `rules.ts`**. The two HTTP tests that pinned 422 assert 400.
- `OrderViewItem` loses `product` and gains `product_name`, one nullable string
  the view reads from `products.bullion` (see below). `BullionPublic` is no
  longer imported by `orders/items.ts`; `Bullion` is, for that one shape.

### The API's own documents read the name from SQL

The invoice, packing list and supplier email printed `line.product?.name`. A
document is one SQL read (rulings 71/73), and the product name IS load-bearing
for a document rather than flair, so `view.sql` carries `product_name` per line
- one scalar subselect, not the embedded row - and `sections.ts`,
`pdfs/service.ts` and `renderEmail.ts` read `line.product_name` directly.

**A first pass stitched this in TypeScript instead** - a `products` map on
`DocumentLabels`, filled by a catalogue read in `order-inputs.ts`, behind a
`productName(line, labels)` helper. That is the result dictionary ruling 78
forbids: a second read and a map assembled in TS to answer a question one SQL
read already had the rows for. The map, the helper and the repo call are gone.

### Files touched

Contracts (2): `checkout/items.ts`, `orders/items.ts`.
SQL (6): `orders/sql/view.sql`, `checkout/items/sql/list_for_order.sql`,
`checkout/items/sql/create_from_product.sql` (new),
`orders/items/sql/create_bought.sql`, `orders/items/sql/create_sold.sql`,
`products/sql/get_liveness.sql` (deleted).
API (8): `db/checkout/items/repo.ts`, `db/products/repo.ts`,
`checkout/rules.ts`, `checkout/service.ts`, `catalog/products/service.ts`,
`media/pdfs/render/sections.ts`, `media/pdfs/service.ts`,
`media/emails/utils/renderEmail.ts`.
Tests (9): `checkout/tests/basket-lines.test.ts` (new, the union parse),
`checkout/tests/checkout-items-http.test.ts`,
`db/checkout/items/tests/repo.test.ts` (the `createMany` test became the
snapshot test), `db/orders/tests/view.test.ts`,
`orders/tests/purchase-read.test.ts`, `orders/tests/sales-read.test.ts`,
`catalog/products/tests/service.test.ts`,
`media/emails/tests/renderEmail.test.ts`,
`media/pdfs/tests/documents-agree.test.ts`.

### Frontend breakages (not changed - ruling 44)

74 type errors across 16 files, and they have two roots.

**Root 1 - `CheckoutLine = CheckoutItemPatch & { id: string }`** in
`features/checkout/items/types.ts`. An intersection with a union distributes, so
no property is reachable without narrowing. The fix is one decision: make
`CheckoutLine` the browser's own draft shape and let `toNewCheckoutItem` be
where it becomes one of the two contract shapes (it already branches on
`bullion_id`). `lineFromProduct` must also stop attaching `pre_melt` and `unit`
to a bullion line - the server snapshots them and the union now refuses them.

- `features/checkout/items/types.ts` (22)
- `features/orders/salesOrders/admin/createSalesOrder/createSalesOrderDrawer.tsx` (11)
- `features/quotes/queries.ts` (7)
- `features/scrap/ui/ReviewStep.tsx` (5)
- `features/checkout/purchase-order-checkout/reviewStep/itemTable.tsx` (5)
- `features/checkout/items/flair.ts` (5)
- `features/checkout/items/ui/PurchaseItems.tsx` (4)
- `features/checkout/items/ui/SaleItems.tsx` (3)
- `features/products/ui/ProductPageDetails.tsx` (2)
- `features/checkout/sales-order-checkout/saleQuote.ts` (2)
- `features/checkout/items/basket.test.ts` (2)
- `features/products/ui/ProductCard.tsx` (1)
- `features/products/ui/BullionCard.tsx` (1)
- `features/checkout/sales-order-checkout/summary/orderSummary.tsx` (1)
- `features/quotes/queries.test.tsx` (1)

**Root 2 - `item.product` is gone from the order view**, in
`features/orders/salesOrders/users/salesOrderDrawer/drawerContents/useSalesOrderLines.ts`
(2). That file already calls `useProducts()` and already looks `mint_name` up
by `bullion_id`; `name` and `image_front` join it. Its header comment says the
lines "come with the view now, each carrying the catalogue row behind it" and
needs rewriting.

`frontend/shared/tests/checkoutServer.ts` types items as `CheckoutItemPatch[]`
and still compiles.
