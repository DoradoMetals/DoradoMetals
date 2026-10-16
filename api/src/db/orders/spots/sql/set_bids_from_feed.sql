-- Locking an order's spots copies today's feed onto the frozen rows of the
-- metals the order holds; unlocking clears every row. One statement over the
-- order's rows, so no metal-to-bid map has to be stitched in TypeScript
-- (ruling 78). A metal the feed does not carry clears to NULL.
--
-- ONLY THE ORDER'S METALS LOCK (ruling 2026-10-14). A row left behind by a lot
-- that has since gone or changed metal is cleared and never re-locked.
--
-- BOTH sides move together (MP F10): a finalised order's payout and its
-- documents read one day's pair.
UPDATE orders.spots os
   SET bid = CASE WHEN $2::boolean AND os.metal_id IN (SELECT li.metal_id
                                                         FROM orders.lots ol
                                                         JOIN inventory.lots li ON li.id = ol.lot_id
                                                        WHERE ol.order_id = $1)
                  THEN (SELECT s.bid FROM spots.resolved s WHERE s.metal_id = os.metal_id)
                  ELSE NULL END,
       ask = CASE WHEN $2::boolean AND os.metal_id IN (SELECT li.metal_id
                                                         FROM orders.lots ol
                                                         JOIN inventory.lots li ON li.id = ol.lot_id
                                                        WHERE ol.order_id = $1)
                  THEN (SELECT s.ask FROM spots.resolved s WHERE s.metal_id = os.metal_id)
                  ELSE NULL END
 WHERE os.order_id = $1
RETURNING os.metal_id
