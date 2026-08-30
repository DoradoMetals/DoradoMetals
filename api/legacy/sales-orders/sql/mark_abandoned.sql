-- Mirror of features/orders/sql/mark_sale_abandoned.sql - the exchange half,
-- conditional from Pending for the same retry-safety reason.
UPDATE exchange.sales_orders
   SET sales_order_status = 'Cancelled', updated_by = $2, updated_at = NOW()
 WHERE id = $1
   AND sales_order_status = 'Pending'
RETURNING id
