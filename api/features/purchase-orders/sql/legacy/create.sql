-- The exchange half. THIS FILE IS SCHEDULED FOR DELETION.
--
-- One row where the new schema takes several: exchange keeps the offer and the
-- money on the order itself, so there is nothing else to write here.
--
-- THE ORDER NUMBER IS A PARAMETER, NOT THE COLUMN DEFAULT. sql/create.sql has
-- already drawn it from exchange.purchase_orders_order_number_seq for
-- orders.orders; letting this INSERT fall through to the column's DEFAULT
-- would draw the same sequence a second time, and the two schemas would
-- disagree about the one number a customer quotes on the phone. Found by the
-- wave-1 parity ledger; pinned by write.service.test.js.
INSERT INTO exchange.purchase_orders (id, user_id, address_id, purchase_order_status, order_number)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, order_number
