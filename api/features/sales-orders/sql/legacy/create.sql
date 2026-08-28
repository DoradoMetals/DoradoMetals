-- The same order in the schema still serving as record of truth, which keeps
-- the money on the order's own row.
--
-- THE ORDER NUMBER IS A PARAMETER, NOT THE COLUMN DEFAULT. sql/create.sql has
-- already drawn it from exchange.sales_orders_order_number_seq for
-- orders.orders; letting this INSERT fall through to the column's DEFAULT
-- would draw the same sequence a second time, and the two schemas would
-- disagree about the one number a customer quotes on the phone. Found by the
-- wave-1 parity ledger; pinned by repo.dual.test.js.
INSERT INTO exchange.sales_orders (
  id, user_id, address_id, sales_order_status, order_total, shipping_service,
  shipping_cost, pre_charges_amount, post_charges_amount,
  subject_to_charges_amount, used_funds, item_total, base_total,
  charges_amount, sales_tax, order_number
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
RETURNING id
