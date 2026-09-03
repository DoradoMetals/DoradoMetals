-- Linking a parcel to a fulfillment. The service reads by shipment_id first, so this is a genuine insert, never a conflict.
INSERT INTO fulfillments.shipments
       (id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
