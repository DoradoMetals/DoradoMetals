INSERT INTO orders.action_reasons (order_id, action, reason)
VALUES ($1, $2, $3)
RETURNING id, order_id, action, reason, created_at, updated_at, created_by_id, updated_by_id
