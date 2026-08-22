-- orders.spots and refiners.spots cannot hold what their sources hold.
--
-- Found by scripts/audit-coverage.mjs, which was written after orders turned
-- out to be missing twenty-one columns discovered one repo function at a time.
-- Running it across every feature found forty-two such columns; these eight are
-- the ones belonging to features being migrated now.
--
-- findMetalsByOrderId returns created_at and updated_at on every spot row and
-- both are populated on all 120, so without them the read cannot be reproduced
-- and the wire shape would change - which the standing rule forbids.
--
-- The percentages are the rate tier applied to that order at the time. Note
-- that this is the opposite decision from metals.metals, where the equivalent
-- columns were deliberately dropped because rates.rates supersedes them. It is
-- not the same thing: on exchange.metals they are the current tier, which
-- rates.rates now owns; on an order they are what was actually applied when the
-- order was priced, and there is nowhere else that records it.
--
-- percent_change and dollar_change are not added. They are null on all 120 rows
-- and all 124, and the repo can project null for them without inventing a
-- column - the same position CLAUDE.md records for the exchange originals.
-- If anything ever starts writing them, they will need a home.
--
-- Additive, nullable, filled by 036. exchange is untouched.

ALTER TABLE orders.spots
  ADD COLUMN IF NOT EXISTS scrap_percentage numeric,
  ADD COLUMN IF NOT EXISTS bullion_percentage numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE refiners.spots
  ADD COLUMN IF NOT EXISTS scrap_percentage numeric,
  ADD COLUMN IF NOT EXISTS bullion_percentage numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
