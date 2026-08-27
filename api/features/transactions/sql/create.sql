-- A ledger entry.
--
-- exchange kept purchase_order_id and sales_order_id as separate columns;
-- payments.ledger has one order_id, because a ledger row belongs to exactly one
-- order either way. The service accepts both and collapses them, so a caller
-- does not have to know which schema it is writing to.
INSERT INTO payments.ledger (id, user_id, type, order_id, amount)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, user_id, type, order_id, amount, occurred_at, created_at, updated_at
