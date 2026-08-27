-- A new sales order.
--
-- `direction = 'sale'` is what makes this a sales order in a table that holds
-- both. `number` is drawn from EXCHANGE's sequence, deliberately: the two
-- schemas share one numbering space while both are live, and the new schema has
-- no sequence of its own. PROMOTION.md's ORDERS_SOURCE note is about exactly
-- this, and it is why the sequences must be created and seeded before the
-- orders switches move past dual.
INSERT INTO orders.orders (id, user_id, direction, status, number, created_by, updated_by)
VALUES ($1, $2, 'sale', $3,
        nextval('exchange.sales_orders_order_number_seq'), $4, $4)
RETURNING id, number
