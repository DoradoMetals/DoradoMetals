-- Unlinking a parcel from its fulfillment.
-- Called when the shipment itself is deleted (FK); the fulfillment survives - an order can be fulfilled without a surviving shipment record.
DELETE FROM fulfillments.shipments WHERE shipment_id = $1
