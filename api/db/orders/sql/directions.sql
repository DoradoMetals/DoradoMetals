-- The direction of several orders at once, batched.
SELECT id, direction::text AS direction
  FROM orders.orders
 WHERE id = ANY($1::uuid[])
