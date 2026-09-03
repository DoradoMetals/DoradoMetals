-- Linking a parcel to a fulfillment. THE CONFLICT IS ON shipment_id, NOT fulfillment_id: a parcel belongs to exactly one fulfillment, but a fulfillment may have SEVERAL parcels (an order can be shipped twice).
-- Getting this backwards is a 42P10 at runtime, not a compile error - the tests below exist to catch it.
INSERT INTO fulfillments.shipments
       (id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (shipment_id) DO UPDATE SET
  fulfillment_id        = EXCLUDED.fulfillment_id,
  recipient_location_id = EXCLUDED.recipient_location_id,
  shipper_location_id   = EXCLUDED.shipper_location_id
RETURNING id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
