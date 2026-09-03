-- Everything a caller can change about a booked pickup.
--
-- shipment_id is NOT reassigned. A pickup belongs to the parcel it was booked
-- for; moving it to another one is not an edit, it is a different booking.
UPDATE shipping.pickups
   SET requested_at = $1, status = $2, confirmation_number = $3, location = $4
 WHERE id = $5
RETURNING id, shipment_id, requested_at, status, confirmation_number, location
