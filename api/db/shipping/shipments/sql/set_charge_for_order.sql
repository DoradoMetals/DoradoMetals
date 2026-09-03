-- The shipping cost of every parcel on one order - resolved through fulfillments.shipments/fulfillments (see get_all.sql).
-- EVERY PARCEL, not one: a fulfillment can have several shipments, so an order shipped twice updates two rows here.
UPDATE shipping.shipments s
   SET cost = $1
  FROM fulfillments.shipments fs
  JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
 WHERE fs.shipment_id = s.id
   AND f.order_id = $2
RETURNING s.id
