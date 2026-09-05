SELECT
       id, shipment_id, requested_at, status,
       confirmation_number, location
  FROM shipping.pickups
 ORDER BY requested_at DESC, id ASC
