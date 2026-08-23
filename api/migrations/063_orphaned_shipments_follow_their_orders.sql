-- The same rule as 062, for the shipping side.
--
-- Production's shipping.shipments holds three rows exchange has no shipment
-- for, under any id - checked by tracking number as well as by id, so these are
-- not re-keyed duplicates. They are the same vintage as the three orders 062
-- removes, and there are three of each.
--
-- Worth writing down what they are, because they do not look like junk: all
-- three carry real FedEx tracking numbers and between them 17 tracking scans,
-- one with 15. A parcel moved. But exchange deleted the order and the shipment
-- after January, and exchange is the source of truth - the copy in the new
-- schema is a photograph of something the business has since removed, not a
-- record the business still holds.
--
-- This is the same reasoning that produced a retraction earlier in this work:
-- 15 FedEx scans looked like a customer owed for metal delivered, and the
-- orders turned out to be cancelled. Scans prove a parcel moved, not that the
-- order is live.
--
-- Nothing references them: none appears in fulfillments.shipments. Their
-- tracking events go with them, since an event whose shipment is gone is not
-- readable by anything.
--
-- Destructive only to the new schemas, which are derived and unpromoted.
-- exchange is only read.

DELETE FROM shipping.tracking t
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.shipments e WHERE e.id = t.shipment_id
) AND NOT EXISTS (
  SELECT 1 FROM exchange.tracking_events te WHERE te.id = t.id
);

-- Keyed on shipment_id, not id.
--
-- fulfillments.shipments is a join table with its own primary key: it links a
-- fulfillment to a shipment and carries the two location ids. An earlier draft
-- of this migration matched on `f.id`, which is that join row's own key and is
-- never a shipment id, so it deleted all 23 rows in dev instead of the 0 it
-- should have. Caught immediately by counting; dev was rebuilt from 052.
--
-- The shipment a join row points at is what has to have gone missing.
DELETE FROM fulfillments.shipments f
WHERE NOT EXISTS (
  SELECT 1 FROM exchange.shipments e WHERE e.id = f.shipment_id
);

DELETE FROM shipping.shipments s
WHERE NOT EXISTS (SELECT 1 FROM exchange.shipments e WHERE e.id = s.id);

-- A fulfillment whose order 062 removed.
DELETE FROM fulfillments.fulfillments f
WHERE NOT EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = f.order_id);
