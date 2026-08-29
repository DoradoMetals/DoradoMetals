-- The fulfillments of several orders at once.
--
-- The batched form of get_by_order.sql, and the reason it exists is D101: the
-- composed order read asked for one order's shipment inside a per-order loop,
-- and every hop of that walk started here. `fulfillments_order_uniq` still
-- makes this at most one row PER ORDER, so a caller may safely key the result
-- by order_id.
SELECT id, order_id, method_id, status, created_at, updated_at,
       created_by, updated_by, created_by_id, updated_by_id
  FROM fulfillments.fulfillments
 WHERE order_id = ANY($1::uuid[])
