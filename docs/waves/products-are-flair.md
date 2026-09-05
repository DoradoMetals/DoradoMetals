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
