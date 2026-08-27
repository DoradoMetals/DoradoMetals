-- Where the fulfillment has got to.
--
-- updated_by_id is COALESCEd rather than assigned: a status moved by a
-- background job should not blank out the admin who last touched it.
UPDATE fulfillments.fulfillments
   SET status = $1, updated_at = now(), updated_by_id = coalesce($2, updated_by_id)
 WHERE id = $3
RETURNING id, order_id, method_id, status, created_at, updated_at,
          created_by_id, updated_by_id
