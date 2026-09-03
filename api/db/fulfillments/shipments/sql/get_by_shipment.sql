-- The link, found from the parcel's side - the read the shipping feature needs, since shipping.shipments carries no order id.
SELECT id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
  FROM fulfillments.shipments
 WHERE shipment_id = ANY($1::uuid[])
