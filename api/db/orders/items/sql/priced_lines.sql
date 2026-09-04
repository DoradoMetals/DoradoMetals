SELECT i.id, m.name AS metal, i.content, i.quantity, i.bullion_id
  FROM orders.items i
  JOIN metals.metals m ON m.id = i.metal_id
 WHERE i.order_id = $1
