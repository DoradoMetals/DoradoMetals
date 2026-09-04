SELECT direction::text AS direction
  FROM orders.orders
 WHERE id = $1
