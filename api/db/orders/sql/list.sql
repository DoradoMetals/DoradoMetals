SELECT id, user_id, direction, status, number, notes, review_created,
       created_by, updated_by, created_at, updated_at,
       created_by_id, updated_by_id, order_sent, tracking_updated, spots_locked
  FROM orders.orders
 WHERE ($1::orders.direction IS NULL OR direction = $1::orders.direction)
   AND ($2::uuid IS NULL OR user_id = $2::uuid)
 ORDER BY created_at DESC, id DESC
