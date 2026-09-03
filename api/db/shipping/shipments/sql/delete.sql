-- Remove a shipment's own row.
-- The service deletes the fulfillments.shipments link first (FK); the fulfillment stays - an order can be fulfilled without a surviving shipment record.
DELETE FROM shipping.shipments WHERE id = $1
