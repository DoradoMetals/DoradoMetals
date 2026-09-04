SELECT id, direction::text AS direction
  FROM orders.orders
 WHERE id = ANY($1::uuid[])
