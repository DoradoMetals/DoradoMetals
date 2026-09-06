-- The collection's owner - see db/shipping/shipments/sql/claim_owner.sql.
UPDATE fulfillments.pickups
   SET user_id = $2
 WHERE fulfillment_id = $1
RETURNING id
