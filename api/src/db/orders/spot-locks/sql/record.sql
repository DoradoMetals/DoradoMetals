-- SQL copies (ruling 66): one row per metal the order holds, straight off
-- orders.spots, so no metal-to-bid map is stitched in TypeScript. The caller
-- records an unlock BEFORE clearing the frozen pair and a lock AFTER setting
-- it, so the event always carries the figures that were in force at the
-- event. A row for a metal the order no longer holds gets no event (ruling
-- 2026-10-14: a lock covers only the order's metals).
INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask, reason)
SELECT os.order_id, os.metal_id, $2::text, os.bid, os.ask, $3
  FROM orders.spots os
 WHERE os.order_id = $1
   AND os.metal_id IN (SELECT li.metal_id
                         FROM orders.lots ol
                         JOIN inventory.lots li ON li.id = ol.lot_id
                        WHERE ol.order_id = $1)
RETURNING metal_id
