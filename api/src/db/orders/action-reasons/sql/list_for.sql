SELECT id, order_id, action, reason, created_at, updated_at, created_by_id, updated_by_id
  FROM orders.action_reasons
 WHERE order_id = $1
 ORDER BY created_at ASC, id ASC
