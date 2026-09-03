-- A new order, either direction - the ONE creation statement (D209's CRUD
-- ruling collapsed create_purchase/create_sales/create_from_checkout here).
--
-- THE NUMBER IS NATIVE SINCE D213. This drew from exchange's per-direction
-- sequence, which made every order create a WRITE to exchange - nextval
-- mutates - long after the purge was supposed to have ended them. It did not
-- show up in any sweep because it is a function call, not an INSERT. 079 built
-- orders.purchase_number_seq and orders.sale_number_seq for this moment and 115
-- re-seeded them to clear the numbers already issued.
--
-- An explicit id wins; NULL generates one.
INSERT INTO orders.orders (
  id, user_id, direction, status, number, notes,
  created_by, updated_by, created_by_id
) VALUES (
  COALESCE($1, gen_random_uuid()), $2, $3::orders.direction, $4,
  nextval(CASE $3::text WHEN 'purchase'
          THEN 'orders.purchase_number_seq'
          ELSE 'orders.sale_number_seq' END),
  $5, $6, $6, $7
)
RETURNING id, number
