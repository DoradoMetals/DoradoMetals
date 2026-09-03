-- The shipping cost of every parcel on one order.
--
-- exchange.shipments.net_charge is `cost` here, and the order link is three
-- hops away rather than a column - fulfillments.shipments ->
-- fulfillments.fulfillments -> the order. See get_all.sql for why.
--
-- EVERY PARCEL, not one. A fulfillment may have several shipments (the unique
-- index in fulfillments.shipments is on shipment_id, so an order shipped twice
-- has two rows), and the exchange statement this mirrors is
-- `WHERE purchase_order_id = $2`, which updates all of them. Keying on one
-- shipment would silently change fewer rows than the legacy write.
UPDATE shipping.shipments s
   SET cost = $1
  FROM fulfillments.shipments fs
  JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
 WHERE fs.shipment_id = s.id
   AND f.order_id = $2
RETURNING s.id
