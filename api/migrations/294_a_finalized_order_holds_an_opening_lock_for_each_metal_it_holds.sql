-- A FINALIZED ORDER HOLDS AN OPENING LOCK EVENT FOR EACH METAL IT HOLDS.
--
-- Same statement as 292. 292 first shipped without the orders.lots join and
-- would have written events for metals an order does not hold; it was
-- corrected in place on 2026-10-16 before production ever ran it (dev had
-- applied it with 0 rows). This migration stays as a second idempotent pass:
-- ruling 2026-10-14, a lock covers only the order's metals.
--
-- THE EVENT IS THE OPENING LOCK, derived as 243 derived it: the frozen bid and
-- ask from the order's own orders.spots row, dated at finalize and attributed
-- to whoever finalized it. Nothing is re-read from the feed.
--
-- IDEMPOTENT: NOT EXISTS per order and metal, so a re-run adds nothing, and so
-- is a run after 292. Purely additive: rows appended to orders.spot_locks.
-- `exchange` is neither read nor written.

INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask, reason,
                               created_at, updated_at, created_by_id)
SELECT os.order_id, os.metal_id, 'lock', os.bid, os.ask, 'opening lock at finalize',
       COALESCE(t.updated_at, t.created_at, o.updated_at, now()),
       COALESCE(t.updated_at, t.created_at, o.updated_at, now()),
       COALESCE(t.updated_by_id, o.updated_by_id)
  FROM orders.spots os
  JOIN orders.orders o ON o.id = os.order_id
  JOIN orders.transactions t ON t.order_id = o.id
 WHERE o.spots_locked IS TRUE
   AND t.total IS NOT NULL
   AND os.bid IS NOT NULL
   AND os.metal_id IN (SELECT li.metal_id
                         FROM orders.lots ol
                         JOIN inventory.lots li ON li.id = ol.lot_id
                        WHERE ol.order_id = os.order_id)
   AND NOT EXISTS (SELECT 1 FROM orders.spot_locks el
                    WHERE el.order_id = os.order_id
                      AND el.metal_id = os.metal_id);
