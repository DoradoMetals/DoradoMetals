-- One fulfillment link per shipment.
--
-- fulfillments.shipments joins a fulfillment to a shipment and holds the two
-- locations. It has 16 rows across 16 distinct shipments, so the invariant is
-- already true and simply not enforced.
--
-- Needed for the backfill to be idempotent: without something to conflict on,
-- re-running would add a second link for every shipment.
--
-- Note this is deliberately not a unique on fulfillment_id. One fulfillment per
-- ORDER is already enforced by fulfillments_order_uniq, and an order can have
-- more than one shipment - an inbound leg and a return - so a fulfillment may
-- legitimately link to several.
--
-- exchange is untouched.

CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_shipments_one_per_shipment
  ON fulfillments.shipments (shipment_id);
