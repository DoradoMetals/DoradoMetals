-- The same entry, in the schema still serving as record of truth.
--
-- The two order columns are separated again here. Which one a value lands in is
-- decided by the ORDER's direction, which the service resolves - guessing from
-- the id alone is not possible.
INSERT INTO exchange.account_transactions
       (id, user_id, transaction_type, purchase_order_id, sales_order_id, amount)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id
