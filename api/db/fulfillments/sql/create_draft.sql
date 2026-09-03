-- A draft: a fulfillment with no order yet. Checkout mutates it while the customer decides; order creation attaches it. No conflict target - unique(order_id) ignores NULLs.
INSERT INTO fulfillments.fulfillments (id, order_id, method_id, status)
VALUES ($1, NULL, $2, 'PENDING')
RETURNING id, order_id, method_id, status, created_at, updated_at,
          created_by_id, updated_by_id
