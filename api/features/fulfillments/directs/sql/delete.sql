-- Cancelling an appointment removes the booking, not the fulfillment.
DELETE FROM fulfillments.directs WHERE fulfillment_id = $1
