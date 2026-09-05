-- Locking an order's spots copies today's feed onto every frozen row; unlocking
-- clears them. One statement over the order's rows, so no metal-to-bid map has
-- to be stitched in TypeScript (ruling 78). A metal the feed does not carry
-- clears to NULL, which is what the map's `?? null` did.
UPDATE orders.spots os
   SET bid = CASE WHEN $2::boolean
                  THEN (SELECT s.bid FROM spots.spots s WHERE s.metal_id = os.metal_id)
                  ELSE NULL END
 WHERE os.order_id = $1
RETURNING os.metal_id
