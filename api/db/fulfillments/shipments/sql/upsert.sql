-- Linking a parcel to a fulfillment.
--
-- THE CONFLICT IS ON shipment_id, NOT fulfillment_id, and that is what the
-- unique index says: `fulfillment_shipments_one_per_shipment` is UNIQUE on
-- shipment_id alone. So a parcel belongs to exactly one fulfillment, and a
-- fulfillment may have SEVERAL parcels - which is right, because an order can
-- legitimately be shipped twice.
--
-- Getting this backwards is a 42P10 at runtime, not a compile error. It was
-- backwards here until the shipments tests stopped being vacuous.
INSERT INTO fulfillments.shipments
       (id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (shipment_id) DO UPDATE SET
  fulfillment_id        = EXCLUDED.fulfillment_id,
  recipient_location_id = EXCLUDED.recipient_location_id,
  shipper_location_id   = EXCLUDED.shipper_location_id
RETURNING id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
