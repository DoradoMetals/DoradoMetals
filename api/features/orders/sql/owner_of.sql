-- Who an order belongs to.
--
-- A fulfillment carries no user of its own - it belongs to an order and the
-- order belongs to somebody - so "is this yours" is a question about the order.
SELECT user_id FROM orders.orders WHERE id = $1
