-- Make the new schemas timezone-aware.
--
-- 19 columns were declared `timestamp without time zone`, which is the same
-- mistake exchange made and the new design was meant to correct. A naive
-- timestamp has no instant attached to it: the same value means different
-- moments depending on who reads it, which matters here because offers expire
-- and shipments are tracked against real times.
--
-- The USING clause states that the values already stored are UTC. That is what
-- they are: the driver sends JS Dates as UTC, and every row in these tables
-- came from a bulk copy through that same driver. Without the clause Postgres
-- would reinterpret them in the session timezone and shift every one.
--
-- Safe to do now: these tables serve no traffic, and the rows are a stale
-- January copy that the backfills will rewrite anyway.

ALTER TABLE core.bullion
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE core.bullion
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE core.mints
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE core.mints
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE fulfillments.directs
  ALTER COLUMN end_time TYPE timestamptz USING end_time AT TIME ZONE 'UTC';
ALTER TABLE fulfillments.directs
  ALTER COLUMN start_time TYPE timestamptz USING start_time AT TIME ZONE 'UTC';
ALTER TABLE fulfillments.pickups
  ALTER COLUMN end_time TYPE timestamptz USING end_time AT TIME ZONE 'UTC';
ALTER TABLE fulfillments.pickups
  ALTER COLUMN start_time TYPE timestamptz USING start_time AT TIME ZONE 'UTC';
ALTER TABLE orders.offers
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE orders.offers
  ALTER COLUMN offer_expiration TYPE timestamptz USING offer_expiration AT TIME ZONE 'UTC';
ALTER TABLE orders.offers
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE orders.orders
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE orders.orders
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE orders.transactions
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE orders.transactions
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE places.addresses
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE places.addresses
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE shipping.services
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE shipping.services
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
