UPDATE shipping.pickups
   SET requested_at = $1, status = $2, confirmation_number = $3, location = $4
 WHERE id = $5
RETURNING id, shipment_id, requested_at, status, confirmation_number, location
