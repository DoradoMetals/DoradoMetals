-- Creates the fulfillment, or does nothing if the order already has one.
--
-- DO NOTHING returns no row when the order already had one, which is the normal
-- case for a second call rather than an error - one fulfillment per order is
-- the rule, not a race to lose. The service reads it back either way.
--
-- created_by_id WAS $5 AND IS GONE: public.audit_stamp writes it, and the five
-- other audit columns, from the actor on the connection (migration 116).
INSERT INTO fulfillments.fulfillments (id, order_id, method_id, status)
VALUES ($1, $2, $3, $4)
ON CONFLICT (order_id) DO NOTHING
RETURNING id, order_id, method_id, status, created_at, updated_at,
          created_by_id, updated_by_id
