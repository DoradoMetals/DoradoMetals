INSERT INTO refiners.spots (order_id, refiner_order_id, metal_id)
SELECT os.order_id, $2, os.metal_id
  FROM orders.spots os
 WHERE os.order_id = $1
   AND NOT EXISTS (SELECT 1
                     FROM refiners.spots rs
                    WHERE rs.refiner_order_id = $2 AND rs.metal_id = os.metal_id)
RETURNING id
