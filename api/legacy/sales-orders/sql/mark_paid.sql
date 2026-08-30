-- Mirror of features/orders/sql/mark_sale_paid.sql - the exchange half of the
-- payment-settled advance, conditional from Pending for the same retry-safety
-- reason. See that file's header.
UPDATE exchange.sales_orders
   SET sales_order_status = 'Preparing', updated_by = $2, updated_at = NOW()
 WHERE id = $1
   AND sales_order_status = 'Pending'
RETURNING id
