-- Remove a shipment's own row.
--
-- The service deletes the fulfillments.shipments link first: it references this
-- table, and the fulfillment itself is left alone because an order can be
-- fulfilled without a surviving shipment record.
DELETE FROM shipping.shipments WHERE id = $1
