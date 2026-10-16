INSERT INTO orders.payout_methods (order_id, method_id, amount)
VALUES ($1, $2, $3)
RETURNING id, order_id, method_id, amount, created_at, updated_at, created_by_id, updated_by_id
