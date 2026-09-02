-- A new order from a completed checkout, either direction. The number is
-- drawn from EXCHANGE's sequence for the direction - the same shared numbering
-- space create_purchase.sql and create_sales.sql document; the CASE keeps one
-- statement for a table that holds both directions.
INSERT INTO orders.orders (
  user_id, direction, status, number, notes, review_created,
  created_by_id, created_at, updated_at
) VALUES (
  $1, $2::orders.direction, $3,
  nextval(CASE $2::text WHEN 'purchase'
          THEN 'exchange.purchase_orders_order_number_seq'
          ELSE 'exchange.sales_orders_order_number_seq' END),
  $4, false, $5, now(), now()
)
RETURNING id, number
