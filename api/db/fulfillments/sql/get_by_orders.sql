-- The fulfillments of several orders at once - the batched form of get_by_order.sql; `fulfillments_order_uniq` still makes this at most one row per order.
SELECT id, order_id, method_id, status, created_at, updated_at,
       created_by, updated_by, created_by_id, updated_by_id
  FROM fulfillments.fulfillments
 WHERE order_id = ANY($1::uuid[])
