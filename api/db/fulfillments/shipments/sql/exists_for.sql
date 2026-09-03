-- Whether a fulfillment already has a parcel.
--
-- Asked before moving an order off SHIPMENT. A shipment link points at a real
-- shipping.shipments row with a tracking number and a label that was paid for,
-- and a parcel does not stop existing because somebody changed a dropdown.
SELECT EXISTS (
         SELECT 1 FROM fulfillments.shipments WHERE fulfillment_id = $1
       ) AS present
