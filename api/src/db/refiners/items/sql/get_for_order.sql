SELECT ri.id, ri.order_item_id, ri.refiner_id, ri.bullion_id, ri.metal_id,
       ri.pre_melt, ri.post_melt, ri.purity, ri.content, ri.premium,
       ri.quantity, ri.unit, ri.refiner_order_id
  FROM refiners.items ri
  JOIN orders.items oi ON oi.id = ri.order_item_id
 WHERE oi.order_id = $1
 ORDER BY ri.order_item_id ASC
