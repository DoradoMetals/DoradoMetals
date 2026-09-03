-- One-way attach: WHERE order_id IS NULL makes a second call a no-op, not a silent repoint - a fulfillment never moves between orders.
-- unique(order_id) refuses a second fulfillment for the same order with 23505 rather than letting two drafts race.
UPDATE fulfillments.fulfillments
   SET order_id = $2
 WHERE id = $1
   AND order_id IS NULL
RETURNING id, order_id, method_id, status, created_at, updated_at,
          created_by_id, updated_by_id
