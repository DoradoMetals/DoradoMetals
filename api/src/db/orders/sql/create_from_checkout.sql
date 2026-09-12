INSERT INTO orders.orders (user_id, direction, number)
SELECT c.user_id,
       c.direction,
       nextval('orders.number_seq')
  FROM checkout.checkouts c
 WHERE c.id = $1
RETURNING *
