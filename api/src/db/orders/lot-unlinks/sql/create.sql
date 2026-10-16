INSERT INTO orders.lot_unlinks (order_id, lot_id, reason)
VALUES ($1, $2, $3)
RETURNING id, order_id, lot_id, reason, created_at, updated_at, created_by_id, updated_by_id
