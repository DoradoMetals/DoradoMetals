-- One spot quote per order and metal.
--
-- orders.spots holds 120 rows across 120 distinct (order_id, metal_id) pairs,
-- so the invariant is already true - it was simply never enforced. The order
-- read joins on it as though it were, and a duplicate would quote an order two
-- different prices for the same metal, which is a pricing bug rather than a
-- display one.
--
-- Also what the dual-write mirror needs to conflict on. Without it the mirror
-- cannot upsert and has to read-then-branch, which races with itself.
--
-- exchange is untouched. Note that exchange.order_metals has no such
-- constraint either; it is not being added there, because adding a constraint
-- to a live table is a separate decision from making the new one correct.

CREATE UNIQUE INDEX IF NOT EXISTS order_spots_one_per_order_metal
  ON orders.spots (order_id, metal_id);
