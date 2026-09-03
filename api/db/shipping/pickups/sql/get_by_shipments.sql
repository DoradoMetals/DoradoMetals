-- Every pickup hanging off any of these shipments - how "the order's pickups" is answered without a query per shipment.
SELECT
       id, shipment_id, requested_at, status,
       confirmation_number, location
  FROM shipping.pickups
 WHERE shipment_id = ANY($1::uuid[])
 ORDER BY requested_at DESC, id ASC
