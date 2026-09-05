INSERT INTO shipping.pickups
       (shipment_id, requested_at, status, confirmation_number, location)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, shipment_id, requested_at, status, confirmation_number, location
