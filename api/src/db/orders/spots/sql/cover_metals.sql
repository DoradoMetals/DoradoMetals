-- A metal the order did not hold when it locked - a lot added or edited onto
-- a new metal, an adopted refiner assay - gets its orders.spots row here, from
-- the step that introduced it. On a locked order the row is frozen at today's
-- feed and a `lock` event is written for that metal alone, carrying the reason
-- ($2), so the metal prices at discovery time and the log says why (ruling
-- 2026-10-14). On an unlocked order the row is empty and the next lock fills
-- it. A row a lock or unlock cleared to NULL is filled the same way when a lot
-- of that metal returns. Metals whose row already holds a bid are left untouched.
WITH held AS (
  SELECT DISTINCT li.metal_id
    FROM orders.lots ol
    JOIN inventory.lots li ON li.id = ol.lot_id
   WHERE ol.order_id = $1
),
added AS (
  INSERT INTO orders.spots (order_id, metal_id, ask, bid)
  SELECT o.id, h.metal_id,
         CASE WHEN o.spots_locked THEN s.ask END,
         CASE WHEN o.spots_locked THEN s.bid END
    FROM held h
    JOIN orders.orders o ON o.id = $1
    LEFT JOIN spots.resolved s ON s.metal_id = h.metal_id
  ON CONFLICT (order_id, metal_id) DO UPDATE
     SET bid = EXCLUDED.bid, ask = EXCLUDED.ask
   WHERE orders.spots.bid IS NULL AND EXCLUDED.bid IS NOT NULL
  RETURNING order_id, metal_id, ask, bid
)
INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask, reason)
SELECT a.order_id, a.metal_id, 'lock', a.bid, a.ask, $2
  FROM added a
  JOIN orders.orders o ON o.id = a.order_id
 WHERE o.spots_locked
RETURNING metal_id
