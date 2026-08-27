-- The fulfillment of one order. `fulfillments_order_uniq` makes this at most one
-- row, which is the rule the whole feature rests on.
SELECT id, order_id, method_id, status, created_at, updated_at,
       created_by_id, updated_by_id
  FROM fulfillments.fulfillments
 WHERE order_id = $1
