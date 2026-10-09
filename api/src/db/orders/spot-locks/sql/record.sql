-- SQL copies (ruling 66): one row per frozen metal, straight off orders.spots,
-- so no metal-to-bid map is stitched in TypeScript. The caller records an
-- unlock BEFORE clearing the frozen pair and a lock AFTER setting it, so the
-- event always carries the figures that were in force at the event.
INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask)
SELECT os.order_id, os.metal_id, $2::text, os.bid, os.ask
  FROM orders.spots os
 WHERE os.order_id = $1
RETURNING metal_id
