SELECT id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
  FROM fulfillments.shipments
 WHERE fulfillment_id = ANY($1::uuid[])
 ORDER BY id ASC
