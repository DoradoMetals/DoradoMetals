SELECT id, order_id, method_id, status, created_at, updated_at,
       created_by, updated_by, created_by_id, updated_by_id
  FROM fulfillments.fulfillments
 WHERE order_id = $1
