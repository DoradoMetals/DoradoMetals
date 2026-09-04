SELECT id, user_id, direction, status, number, notes, review_created,
       created_by, updated_by, created_at, updated_at,
       created_by_id, updated_by_id, order_sent, tracking_updated, spots_locked
  FROM orders.orders
 WHERE id = $1
