-- The link, found from the parcel's side.
--
-- This is the read features/shipping needs: shipping.shipments does not carry
-- an order id, and this is the first hop of putting it back.
SELECT id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
  FROM fulfillments.shipments
 WHERE shipment_id = ANY($1::uuid[])
