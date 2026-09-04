INSERT INTO orders.orders (id, user_id, direction, status, number)
SELECT COALESCE($1, gen_random_uuid()), c.user_id,
       c.direction::orders.direction, $2,
       nextval(CASE c.direction WHEN 'purchase'
               THEN 'orders.purchase_number_seq'
               ELSE 'orders.sale_number_seq' END)
  FROM checkout.checkouts c
 WHERE c.id = $3
RETURNING *
