INSERT INTO payments.refunds (order_id, rail, provider, payment_ref, details_id, amount, reason)
VALUES ($1, $2::payments.rail, $3, $4, $5, $6, $7)
RETURNING *
