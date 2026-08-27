-- The spot price an order was quoted at, per metal.
--
-- THE CANONICAL ONE, for both directions. sales-orders carries an identical
-- insert in its own sql/ (the same shape as D42) and converges here when it
-- next changes; the audit already reports orders.spots as multi-writer.
--
-- ON CONFLICT (order_id, metal_id) because that pair is UNIQUE - checked
-- against pg_indexes rather than assumed: order_spots_one_per_order_metal.
-- exchange's insertOrderMetals had no conflict handling at all and would raise
-- on a second call for the same order; DO NOTHING makes creating an order's
-- spot rows idempotent, which is what the dual-write path needs when a mirror
-- re-runs.
INSERT INTO orders.spots (id, order_id, metal_id, ask, bid)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (order_id, metal_id) DO NOTHING
RETURNING id, order_id, metal_id, ask, bid
