-- The fulfillment's links, HANDOVER FIRST. `fulfillments.shipments.id` is a
-- random uuid, so ordering by it picked a return leg over the inbound parcel
-- about half the time once a cancel had linked one (LD F3).
SELECT fs.id, fs.fulfillment_id, fs.shipment_id,
       fs.recipient_location_id, fs.shipper_location_id
  FROM fulfillments.shipments fs
  JOIN shipping.shipments s ON s.id = fs.shipment_id
 WHERE fs.fulfillment_id = $1
 ORDER BY (s.direction = 'Return') ASC, s.created_at ASC NULLS FIRST, s.id ASC
