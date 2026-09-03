-- THE ONE-WAY ATTACH (D208): a draft becomes the order's fulfillment. The
-- WHERE order_id IS NULL guard makes a second attach a zero-row update rather
-- than a silent repoint - a fulfillment never moves between orders - and the
-- unique(order_id) index refuses a second fulfillment for the same order with
-- 23505 rather than letting two drafts race.
--
-- updated_at and updated_by_id LEFT THE SET LIST: public.audit_stamp writes
-- both from the actor on the connection (migration 116).
UPDATE fulfillments.fulfillments
   SET order_id = $2
 WHERE id = $1
   AND order_id IS NULL
RETURNING id, order_id, method_id, status, created_at, updated_at,
          created_by_id, updated_by_id
