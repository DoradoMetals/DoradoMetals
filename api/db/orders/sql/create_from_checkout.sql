INSERT INTO orders.orders (user_id, direction, status, number)
SELECT c.user_id,
       c.direction, $1,
       nextval(CASE c.direction WHEN 'purchase'
               THEN 'orders.purchase_number_seq'
               ELSE 'orders.sale_number_seq' END)
  FROM checkout.checkouts c
 WHERE c.id = $2
RETURNING *
