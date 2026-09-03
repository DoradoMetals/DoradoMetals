-- Whether each id is live, for the two directions independently. Its own statement rather than a field on the storefront projection: `display`/`sell_display` are admin facts and must not reach the public wire.
SELECT id, display, sell_display
  FROM products.bullion
 WHERE id = ANY($1::uuid[])
