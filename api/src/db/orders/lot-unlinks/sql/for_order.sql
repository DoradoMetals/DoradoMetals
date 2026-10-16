SELECT u.id, u.order_id, u.lot_id, u.reason, u.created_at, u.updated_at,
       u.created_by_id, u.updated_by_id
  FROM orders.lot_unlinks u
 WHERE u.order_id = $1
 ORDER BY u.created_at DESC, u.id DESC
