INSERT INTO orders.orders (user_id, direction, number)
SELECT c.user_id,
       c.direction,
       nextval(CASE c.direction WHEN 'purchase'
               THEN 'orders.purchase_number_seq'
               ELSE 'orders.sale_number_seq' END)
  FROM checkout.checkouts c
 WHERE c.id = $1
RETURNING *
