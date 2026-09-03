-- Whether an id is live on the BUY side. Its own statement rather than a
-- field on the storefront projection: `display` is an admin fact and must
-- not reach the public wire. The sell side has no gate (ruling 49) - a bid
-- liveness check needs only to know the id names a product at all, which
-- this same query answers by returning a row or not.
SELECT id, display
  FROM products.bullion
 WHERE id = ANY($1::uuid[])
