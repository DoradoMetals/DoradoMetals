-- The shipment links of one fulfillment.
--
-- RETURNS A LIST. The unique index is on shipment_id, so a fulfillment may have
-- several parcels - an order shipped twice has two. Ordered by id so two
-- callers reading the same fulfillment get them in the same order.
--
-- NOT shipping.shipments. This table is the join between a fulfillment and the
-- parcel that satisfies it, plus where it went from and to. The parcel itself -
-- tracking number, label, cost - belongs to features/shipping.
SELECT id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
  FROM fulfillments.shipments
 WHERE fulfillment_id = $1
 ORDER BY id ASC
