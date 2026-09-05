INSERT INTO refiners.items
       (order_item_id, refiner_order_id, bullion_id, metal_id, quantity)
SELECT oi.id, $2, oi.bullion_id, oi.metal_id, COALESCE(oi.quantity, 1)
  FROM orders.items oi
 WHERE oi.order_id = $1
   AND NOT EXISTS (SELECT 1 FROM refiners.items ri WHERE ri.order_item_id = oi.id)
RETURNING id
