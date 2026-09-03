-- Whether each id is live, for the two directions independently.
--
-- Its own statement rather than a field on the storefront projection: `display`
-- and `sell_display` are admin facts, and adding them to the public list would
-- put them on the wire. Checkout needs to know them and a customer does not.
SELECT id, display, sell_display
  FROM products.bullion
 WHERE id = ANY($1::uuid[])
