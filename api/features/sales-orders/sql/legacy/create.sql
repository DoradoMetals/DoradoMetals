-- The same order in the schema still serving as record of truth, which keeps
-- the money on the order's own row.
INSERT INTO exchange.sales_orders (
  id, user_id, address_id, sales_order_status, order_total, shipping_service,
  shipping_cost, pre_charges_amount, post_charges_amount,
  subject_to_charges_amount, used_funds, item_total, base_total,
  charges_amount, sales_tax
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING id
