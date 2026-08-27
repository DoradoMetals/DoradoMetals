-- The exchange half. THIS FILE IS SCHEDULED FOR DELETION.
--
-- One row where the new schema takes several: exchange keeps the offer and the
-- money on the order itself, so there is nothing else to write here.
INSERT INTO exchange.purchase_orders (id, user_id, address_id, purchase_order_status)
VALUES ($1, $2, $3, $4)
RETURNING id, order_number
