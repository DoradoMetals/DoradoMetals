-- Populate shipping.shipments and shipping.tracking from exchange.
--
-- The last of the transformations that were reported as blocked. They were not:
-- the two "product decisions" recorded against shipping.services turned out to
-- be artifacts of reading dev, where exchange.carrier_services holds two of the
-- eight rows production holds. 047 seeds the services and the package sizes, so
-- a shipment can now resolve both.
--
-- What a shipment references rather than names:
--
--   service_type  text  ->  carrier_service_id, resolved by (carrier, name)
--   package       text  ->  package_id,         resolved by (carrier, label)
--   carrier_id          ->  no column; reachable through the service
--
-- Resolved by name rather than by id because no id is shared between
-- exchange.carrier_services and shipping.services. Every value production uses
-- has a match - Express Saver, Priority Overnight, Standard, Free and Overnight
-- across 70 shipments; Small, Medium and Large Box across the same.
--
-- The order link does not come across at all. A shipment no longer points at
-- its order; fulfillments.fulfillments does, one row per order, which is why
-- purchase_order_id and sales_order_id are declared dropped rather than mapped.
--
-- Idempotent and guarded like the others. exchange is only ever read.

-- THE PRECONDITION THIS MIGRATION USED TO ASSUME (fixed 2026-09-06, prod-day).
--
-- Every INSERT below writes a shipment with at most ONE of its two addresses:
-- the customer side comes from the order, and the business side has no source
-- in exchange at all. 048 is what makes that legal - it drops the
-- shipments_addresses_required check that demands both - and 048 sits inside
-- 000_genesis_schema.sql's `-- baseline: 002-049`, so on a database that
-- already holds tables the baseline STAMPS it instead of running it.
--
-- Production is exactly that database. Its January shipping.shipments still
-- carries the check, so the upsert below failed for EVERY row and the UAT
-- rehearsal measured shipping.shipments stuck at 41 against exchange.shipments'
-- 71 - thirty shipments that never migrated, with no error anyone would see
-- after the fact. On dev and on a from-nothing build nothing showed, because
-- genesis creates the post-048 shape and there is no constraint to hit.
--
-- So the backfill asserts its own precondition rather than inheriting it. This
-- is 048's statement, verbatim and idempotent; where 048 really did run it is
-- a no-op. It touches no row, drops no column and never names exchange.
ALTER TABLE shipping.shipments
  DROP CONSTRAINT IF EXISTS shipments_addresses_required;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM shipping.shipments n
    WHERE NOT EXISTS (SELECT 1 FROM exchange.shipments e WHERE e.id = n.id)
  ) THEN
    RAISE EXCEPTION
      'refusing to backfill: shipping.shipments holds rows exchange does not, so exchange is no longer authoritative.';
  END IF;
END $$;

-- Shipments.
--
-- actual_cost has no source in exchange and stays null: net_charge is what the
-- label was quoted at, and there is nothing recording what it settled at.
--
-- The customer's address is reachable through the order the shipment belongs
-- to, and is filled here: on an inbound shipment the customer is the shipper,
-- on an outbound one the recipient. The other side is a business location,
-- which exchange does not record - see 048.

INSERT INTO shipping.shipments (
  id, carrier_service_id, package_id, tracking_number,
  shipper_address_id, recipient_address_id,
  delivered_at, shipped_at, est_delivery, label_type, label,
  direction, insured, declared_value, cost,
  shipping_status, pickup_type, created_at
)
SELECT
  e.id,
  (SELECT s.id FROM shipping.services s
    WHERE s.carrier_id = e.carrier_id AND s.name = e.service_type),
  (SELECT p.id FROM shipping.packages p
    WHERE p.carrier_id = e.carrier_id AND p.label = e.package),
  e.tracking_number,
  CASE WHEN e.type = 'Inbound' THEN order_address.id END,
  CASE WHEN e.type = 'Outbound' THEN order_address.id END,
  e.delivered_at, e.shipped_at, e.estimated_delivery,
  e.label_type, e.shipping_label,
  e.type::text::shipping.direction,
  coalesce(e.insured, false), e.declared_value, e.net_charge,
  e.shipping_status, e.pickup_type, e.created_at
FROM exchange.shipments e
LEFT JOIN LATERAL (
  SELECT a.id
  FROM exchange.addresses a
  WHERE a.id = coalesce(
    (SELECT p.address_id FROM exchange.purchase_orders p WHERE p.id = e.purchase_order_id),
    (SELECT s.address_id FROM exchange.sales_orders s WHERE s.id = e.sales_order_id)
  )
  -- Only if the address book has been migrated. On a database built from
  -- nothing this migration runs before 050, so the reference would not resolve;
  -- 050 fills these in once places.addresses exists.
  AND EXISTS (SELECT 1 FROM places.addresses pa WHERE pa.id = a.id)
) AS order_address ON true
ON CONFLICT (id) DO UPDATE SET
  carrier_service_id = EXCLUDED.carrier_service_id,
  shipper_address_id = coalesce(EXCLUDED.shipper_address_id, shipping.shipments.shipper_address_id),
  recipient_address_id = coalesce(EXCLUDED.recipient_address_id, shipping.shipments.recipient_address_id),
  package_id = EXCLUDED.package_id,
  tracking_number = EXCLUDED.tracking_number,
  delivered_at = EXCLUDED.delivered_at,
  shipped_at = EXCLUDED.shipped_at,
  est_delivery = EXCLUDED.est_delivery,
  label_type = EXCLUDED.label_type,
  label = EXCLUDED.label,
  direction = EXCLUDED.direction,
  insured = EXCLUDED.insured,
  declared_value = EXCLUDED.declared_value,
  cost = EXCLUDED.cost,
  shipping_status = EXCLUDED.shipping_status,
  pickup_type = EXCLUDED.pickup_type,
  created_at = EXCLUDED.created_at;

-- Tracking events.
--
-- Note there is no guard on this one, deliberately. dev's shipping.tracking
-- holds 9 rows with no counterpart in dev's exchange.tracking_events, which
-- reads like the condition the guards exist to catch - and is not. Neither
-- those events nor the three shipments they belong to exist in production at
-- all, and production holds 525 tracking events against dev's 72. They are
-- artifacts of the January work against a dev database, so guarding on them
-- would block the backfill everywhere to describe something true in one place.

INSERT INTO shipping.tracking (id, shipment_id, status, location, time)
SELECT e.id, e.shipment_id, e.status, e.location, e.scan_time
FROM exchange.tracking_events e
WHERE EXISTS (SELECT 1 FROM shipping.shipments s WHERE s.id = e.shipment_id)
ON CONFLICT (id) DO UPDATE SET
  shipment_id = EXCLUDED.shipment_id,
  status = EXCLUDED.status,
  location = EXCLUDED.location,
  time = EXCLUDED.time;
