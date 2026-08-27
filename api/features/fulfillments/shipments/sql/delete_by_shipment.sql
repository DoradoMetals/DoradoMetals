-- Unlinking a parcel from its fulfillment.
--
-- Called when the shipment itself is deleted: this table references it, so the
-- link has to go first. The FULFILLMENT survives - an order can be fulfilled
-- without a surviving shipment record, and deleting it would take the order's
-- whole handover arrangement with it.
DELETE FROM fulfillments.shipments WHERE shipment_id = $1
