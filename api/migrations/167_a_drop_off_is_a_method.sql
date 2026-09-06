-- The Drop-off method row. Its own migration because Postgres refuses to USE an
-- enum label in the transaction that added it, and 166 added DROPOFF.
--
-- direction is NULL: a drop-off is the business driving lots to a refinery, so
-- it belongs to no customer direction. hidden, because no customer ever picks
-- it - it is chosen on a refiner order by an admin.

INSERT INTO fulfillments.methods (type, label, admin_label, direction, category, enabled, hidden)
SELECT 'DROP OFF', 'Drop-off', 'Drop Off', NULL, 'DROPOFF'::fulfillments.category, true, true
 WHERE NOT EXISTS (
   SELECT 1 FROM fulfillments.methods m
    WHERE m.category = 'DROPOFF'::fulfillments.category AND m.type = 'DROP OFF');
