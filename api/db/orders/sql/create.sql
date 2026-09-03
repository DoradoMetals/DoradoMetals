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
-- NO AUTHOR COLUMNS. created_by, created_by_id, updated_by, updated_by_id,
-- created_at and updated_at were six of this statement's parameters and are now
-- the public.audit_stamp trigger's, taken from the actor on the connection
-- (migration 116).
--
-- An explicit id wins; NULL generates one.
INSERT INTO orders.orders (
  id, user_id, direction, status, number, notes
) VALUES (
  COALESCE($1, gen_random_uuid()), $2, $3::orders.direction, $4,
  nextval(CASE $3::text WHEN 'purchase'
          THEN 'orders.purchase_number_seq'
          ELSE 'orders.sale_number_seq' END),
  $5
)
RETURNING id, number
