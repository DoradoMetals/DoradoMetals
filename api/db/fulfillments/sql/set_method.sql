-- Changing how an order will be handed over.
--
-- The guards are in service.ts, not here: whether the target method exists,
-- whether the fulfillment does, and whether it already has a parcel. This
-- statement only writes.
UPDATE fulfillments.fulfillments
   SET method_id = $1, updated_at = now(), updated_by_id = coalesce($2, updated_by_id)
 WHERE id = $3
RETURNING id, order_id, method_id, status, created_at, updated_at,
          created_by_id, updated_by_id
