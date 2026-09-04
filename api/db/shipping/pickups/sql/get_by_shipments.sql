SELECT
       id, shipment_id, requested_at, status,
       confirmation_number, location
  FROM shipping.pickups
 WHERE shipment_id = ANY($1::uuid[])
 ORDER BY requested_at DESC, id ASC
