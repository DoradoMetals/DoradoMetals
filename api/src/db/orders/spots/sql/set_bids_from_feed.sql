-- Locking an order's spots copies today's feed onto every frozen row; unlocking
-- clears them. One statement over the order's rows, so no metal-to-bid map has
-- to be stitched in TypeScript (ruling 78). A metal the feed does not carry
-- clears to NULL, which is what the map's `?? null` did.
--
-- BOTH sides move together (MP F10). This used to write `bid` alone, so a
-- finalised order priced its payout at the finalise day's bid while its
-- documents printed the ask frozen at placement - two different days on one
-- invoice, from a pair the contract says are "resolved the same way".
UPDATE orders.spots os
   SET bid = CASE WHEN $2::boolean
                  THEN (SELECT s.bid FROM spots.resolved s WHERE s.metal_id = os.metal_id)
                  ELSE NULL END,
       ask = CASE WHEN $2::boolean
                  THEN (SELECT s.ask FROM spots.resolved s WHERE s.metal_id = os.metal_id)
                  ELSE NULL END
 WHERE os.order_id = $1
RETURNING os.metal_id
