-- The shipment links of several fulfillments at once.
--
-- ORDERED BY id ASC, the same as get_for.sql and for the same reason: a
-- fulfillment may have several parcels and callers that want "the" shipment
-- take the first. Batching that read (D101) is only equivalent to calling
-- get_for per fulfillment if both agree on which one is first.
SELECT id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
  FROM fulfillments.shipments
 WHERE fulfillment_id = ANY($1::uuid[])
 ORDER BY id ASC
