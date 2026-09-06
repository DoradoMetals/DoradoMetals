INSERT INTO fulfillments.fulfillments (order_id, method_id, status)
VALUES ($1, $2, $3)
ON CONFLICT (order_id) DO NOTHING
RETURNING id, order_id, refining_order_id, method_id, status, created_at, updated_at,
          created_by_id, updated_by_id
