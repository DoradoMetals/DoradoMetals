INSERT INTO payments.ledger (id, user_id, type, order_id, amount)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, user_id, type, order_id, amount, occurred_at, created_at, updated_at
