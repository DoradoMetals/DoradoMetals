-- A DRAFT: a fulfillment with no order yet (D208). The checkout flow mutates
-- this row while the customer decides; order creation attaches it. No conflict
-- target - the unique(order_id) index ignores NULLs, and a draft is minted
-- deliberately, once per checkout, by the service that links it.
--
-- created_by_id WAS $3 AND IS GONE - public.audit_stamp writes it (116).
INSERT INTO fulfillments.fulfillments (id, order_id, method_id, status)
VALUES ($1, NULL, $2, 'PENDING')
RETURNING id, order_id, method_id, status, created_at, updated_at,
          created_by_id, updated_by_id
