-- Mirror of features/orders/sql/set_status.sql, which is the new-schema half
-- for BOTH directions (D42). This is the exchange half, and exchange keeps
-- purchase and sales orders in separate tables, so it stays here.
UPDATE exchange.sales_orders
   SET sales_order_status = $1, updated_by = $2, updated_at = NOW()
 WHERE id = $3
RETURNING id
