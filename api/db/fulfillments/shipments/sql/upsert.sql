-- One statement for "this shipment belongs to this fulfillment, at these
-- locations". `fulfillment_shipments_one_per_shipment` is the unique index the
-- conflict target names, so the read-then-branch this replaced cannot race.
INSERT INTO fulfillments.shipments
       (fulfillment_id, shipment_id, recipient_location_id, shipper_location_id)
VALUES ($1, $2, $3, $4)
    ON CONFLICT (shipment_id) DO UPDATE
   SET fulfillment_id = EXCLUDED.fulfillment_id,
       recipient_location_id = EXCLUDED.recipient_location_id,
       shipper_location_id = EXCLUDED.shipper_location_id
RETURNING id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
