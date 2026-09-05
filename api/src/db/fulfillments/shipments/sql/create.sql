INSERT INTO fulfillments.shipments
       (fulfillment_id, shipment_id, recipient_location_id, shipper_location_id)
VALUES ($1, $2, $3, $4)
RETURNING id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
