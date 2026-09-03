-- Cancelling a booking removes the appointment, not the fulfillment. The order
-- is still going to be fulfilled somehow; what changed is that nobody is due
-- anywhere yet.
DELETE FROM fulfillments.pickups WHERE fulfillment_id = $1
