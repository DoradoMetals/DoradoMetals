-- The shipment links of one fulfillment - a LIST: a fulfillment may have several parcels (an order shipped twice has two). Ordered by id for a stable order.
-- NOT shipping.shipments - this is the join, plus where the parcel went from/to; tracking/label/cost belong to the shipping feature.
SELECT id, fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
  FROM fulfillments.shipments
 WHERE fulfillment_id = $1
 ORDER BY id ASC
