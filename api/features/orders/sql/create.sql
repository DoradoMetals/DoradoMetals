-- A new order, either direction - the ONE creation statement (D209's CRUD
-- ruling collapsed create_purchase/create_sales/create_from_checkout here).
-- The number draws from exchange's per-direction sequence: one numbering
-- space while both schemas are live. An explicit id wins (the sales dual
-- write shares its id with exchange); NULL generates one.
INSERT INTO orders.orders (
  id, user_id, direction, status, number, notes,
  created_by, updated_by, created_by_id
) VALUES (
  COALESCE($1, gen_random_uuid()), $2, $3::orders.direction, $4,
  nextval(CASE $3::text WHEN 'purchase'
          THEN 'exchange.purchase_orders_order_number_seq'
          ELSE 'exchange.sales_orders_order_number_seq' END),
  $5, $6, $6, $7
)
RETURNING id, number
