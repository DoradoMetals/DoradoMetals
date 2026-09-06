-- RULING 89 (Jacob, 2026-09-07), the schema half of finding 32.
--
-- Every label the business buys is bought HOLD_AT_LOCATION at one named FedEx
-- Office, and that office was written into TypeScript:
-- `providers/shipments/constants.ts` carried FEDEX_STORE_ADDRESS and
-- DEFAULT_HOLD_AT_LOCATION_DETAIL, including the carrier's own location code
-- 'ADSK', a street address, a phone number and a company name.
--
-- The ruling keeps HOLD_AT_LOCATION and moves the DESTINATION into the
-- database, where the same office already exists: places.locations holds it as
-- the FEDEX_OFFICE row, with its address, its label company name and its label
-- phone number. Two facts were missing from that row, and only two: that it is
-- the business's default return location, and the code the carrier knows it
-- by.
--
-- EXACTLY ONE ROW MAY BE THE DEFAULT, and a partial unique index is what says
-- so - a second row set true is refused by Postgres rather than by whichever
-- read happened to sort first. The predicate keeps the index to the one row
-- that matters.
--
-- The value is set here for dev and carried into a from-nothing build by
-- `scripts/dump-seed.mjs`, which regenerates 047_seed_reference_data.sql from
-- these same rows. Additive only; exchange is neither read nor written.

ALTER TABLE places.locations
  ADD COLUMN IF NOT EXISTS default_return boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS carrier_location_code text;

CREATE UNIQUE INDEX IF NOT EXISTS locations_one_default_return
  ON places.locations (default_return)
  WHERE default_return;

UPDATE places.locations
   SET default_return = true,
       carrier_location_code = 'ADSK'
 WHERE id = (SELECT id FROM places.locations WHERE type = 'FEDEX_OFFICE' ORDER BY id LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM places.locations WHERE default_return);
