-- no-transaction
--
-- Index the new schemas foreign keys, for the same reason migration 001 did it
-- for exchange: Postgres indexes the referenced side automatically but not the
-- referencing side, so every child-to-parent join is a sequential scan.
--
-- Doing it now, while these tables are small and serving nothing, rather than
-- discovering it after a feature has moved onto them.
--
-- CONCURRENTLY plus IF NOT EXISTS, so it neither blocks writes nor breaks on
-- re-run after a partial failure.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_core_mints_image_id"
  ON core."mints" ("image_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_fulfillments_fulfillments_method_id"
  ON fulfillments."fulfillments" ("method_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_payments_intents_details_id"
  ON payments."intents" ("details_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_payments_methods_image_id"
  ON payments."methods" ("image_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_places_locations_image_id"
  ON places."locations" ("image_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_shipping_carriers_organization_id"
  ON shipping."carriers" ("organization_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_shipping_packages_image_id"
  ON shipping."packages" ("image_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_shipping_pickups_shipment_id"
  ON shipping."pickups" ("shipment_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_shipping_shipments_package_id"
  ON shipping."shipments" ("package_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_shipping_shipments_recipient_address_id"
  ON shipping."shipments" ("recipient_address_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_shipping_shipments_shipper_address_id"
  ON shipping."shipments" ("shipper_address_id");
