-- Three columns shipping.shipments cannot hold, of the three it can.
--
-- The coverage audit reported thirteen for shipping. Seven of those were
-- renames nobody had written down - estimated_delivery to est_delivery,
-- shipping_label to label, net_charge to cost, type to direction,
-- tracking_events.scan_time to time - and the two order id columns, which are
-- not lost but relocated: a shipment no longer points at its order, the
-- fulfillment does, one row per order in fulfillments.fulfillments. All of that
-- is now declared in scripts/audit-coverage.mjs so the report says what is
-- actually true.
--
-- That leaves six, and only these three can be closed:
--
--   shipping_status   where the parcel is, 23 of 23 populated. shipping.tracking
--                     records the history; the shipment still needs its current
--                     state, which is what every order read displays.
--   created_at        23 of 23, and the table has no timestamp at all.
--   pickup_type       23 of 23, whether the parcel is collected or dropped off.
--
-- The other three - service_type, package and carrier_id - route through
-- shipping.services and shipping.packages, which are blocked on two product
-- decisions. Adding columns for them now would prejudge those answers, so they
-- stay reported as blocked rather than quietly resolved. See FOLLOWUPS.
--
-- Additive and nullable. No backfill here: shipping.shipments is missing 6 of
-- exchange's 23 rows and 3 more disagree on cost, so filling these columns is
-- part of repairing that copy, not a step that can be taken before it.
--
-- exchange is untouched.

ALTER TABLE shipping.shipments
  ADD COLUMN IF NOT EXISTS shipping_status text,
  ADD COLUMN IF NOT EXISTS pickup_type text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;
