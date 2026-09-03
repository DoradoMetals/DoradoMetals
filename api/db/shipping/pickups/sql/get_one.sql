-- One pickup, by id.
SELECT
       id, shipment_id, requested_at, status,
       confirmation_number, location
  FROM shipping.pickups
 WHERE id = $1
 LIMIT 1
