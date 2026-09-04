SELECT id, user_id
  FROM orders.orders
 WHERE id = ANY($1::uuid[])
