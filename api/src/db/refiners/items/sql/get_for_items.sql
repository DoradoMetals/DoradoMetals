SELECT id, order_item_id, refiner_id, bullion_id, metal_id,
       pre_melt, post_melt, purity, content, premium, quantity, unit
  FROM refiners.items
 WHERE order_item_id = ANY($1::uuid[])
 ORDER BY order_item_id ASC, id ASC
