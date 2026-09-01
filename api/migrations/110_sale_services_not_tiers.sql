-- THE SALE SERVICES ARE shipping.services ROWS, NOT A NEW TABLE (D208).
--
-- 109 created shipping.tiers a day ago because the 'Standard'/'Overnight'/
-- 'Free' rows in shipping.services looked like carrier catalogue entries.
-- Jacob's correction (2026-09-01): they ARE the sale services - shipping
-- services CREATED BY THE BUSINESS, not official carrier ones. A customer
-- picks the service at its fixed price; THE REFINERY picks the carrier later,
-- and that choice lands on the shipment (shipping.shipments.carrier_service_id
-- names a concrete per-carrier row). "We're just trying to normalize our data
-- so it doesn't become a clusterfuck."
--
-- What normalisation means here: the customer-facing rows must be
-- CARRIER-AGNOSTIC - the existing business rows are duplicated per carrier
-- (2 carriers x Standard/Overnight/Free), so a checkout pointing at "Standard"
-- would be forced to pick a carrier by picking a row. carrier_id becomes
-- nullable, and three agnostic rows carry the customer offer: code, price,
-- transit days, and a display flag (FREE is the admin's grant, never shown to
-- customers). The per-carrier duplicates stay - shipments may reference them
-- and they cost nothing - but they carry no price and no display, so nothing
-- customer-facing can resolve to them.

ALTER TABLE shipping.services ALTER COLUMN carrier_id DROP NOT NULL;
ALTER TABLE shipping.services ADD COLUMN IF NOT EXISTS price numeric;
ALTER TABLE shipping.services ADD COLUMN IF NOT EXISTS display boolean NOT NULL DEFAULT false;

-- The stable key for the agnostic rows. `code` exists and is empty on every
-- current row; unique among the carrier-less rows only, so the per-carrier
-- catalogue rows are untouched.
CREATE UNIQUE INDEX IF NOT EXISTS services_agnostic_code_key
  ON shipping.services (code) WHERE carrier_id IS NULL;

INSERT INTO shipping.services
  (carrier_id, name, code, price, display, is_active,
   min_transit_days, max_transit_days, created_by, updated_by)
VALUES
  (NULL, 'Standard',  'STANDARD',  25, true,  true, 3, 3, 'Dorado Metals', 'Dorado Metals'),
  (NULL, 'Overnight', 'OVERNIGHT', 50, true,  true, 1, 1, 'Dorado Metals', 'Dorado Metals'),
  (NULL, 'Free',      'FREE',       0, false, true, 1, 1, 'Dorado Metals', 'Dorado Metals')
ON CONFLICT (code) WHERE carrier_id IS NULL DO NOTHING;

-- allow-destructive: shipping.tiers is one day old (109), holds only its own
-- seed rows (three, reproduced above on shipping.services where they belong),
-- was never referenced by any order, shipment or checkout, and has never
-- existed on production. Nothing to back up: the rows' entire content is in
-- 109 and in this file.
DROP TABLE IF EXISTS shipping.tiers;
