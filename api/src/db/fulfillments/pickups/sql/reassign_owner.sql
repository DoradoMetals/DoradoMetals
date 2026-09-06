-- See db/shipping/shipments/sql/reassign_owner.sql.
UPDATE fulfillments.pickups SET user_id = $2 WHERE user_id = $1
