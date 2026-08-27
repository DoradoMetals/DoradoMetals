-- A new pickup.
--
-- confirmation_number is TEXT here and NUMERIC in exchange. The carrier returns
-- a string, exchange coerced it, and this stores what the carrier said - the
-- read casts back to numeric so the wire is unchanged.
INSERT INTO shipping.pickups
       (id, shipment_id, requested_at, status, confirmation_number, location)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, shipment_id, requested_at, status, confirmation_number, location
