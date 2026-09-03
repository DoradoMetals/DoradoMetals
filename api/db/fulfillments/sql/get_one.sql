-- One fulfillment's own row. The method and the detail are attached by
-- compose.ts, which reads each of those tables once rather than LEFT JOINing
-- all four on every query.
SELECT id, order_id, method_id, status, created_at, updated_at,
       created_by, updated_by, created_by_id, updated_by_id
  FROM fulfillments.fulfillments
 WHERE id = $1
