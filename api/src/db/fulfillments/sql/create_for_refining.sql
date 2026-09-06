-- A drop-off belongs to a REFINER order. `a_fulfillment_serves_one_order` is the
-- CHECK that keeps the two keys apart; this statement is the other half.
INSERT INTO fulfillments.fulfillments (refining_order_id, method_id, status)
VALUES ($1, $2, $3)
RETURNING id, order_id, refining_order_id, method_id, status, created_at, updated_at,
          created_by_id, updated_by_id
