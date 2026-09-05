-- Make spots.spots able to answer "what is the current quote".
--
-- As built it cannot. It holds two rows per metal with no timestamp and no
-- uniqueness, so there is no way to tell which of the pair is current - and
-- neither matches exchange.metals, both being January snapshots. A table that
-- cannot identify the current price is not usable by a pricing API.
--
-- The application model is one live quote per metal: updateSpotPrices issues a
-- single UPDATE per metal against exchange.metals. This mirrors that rather
-- than inventing a time series, which would be a feature rather than a
-- migration.
--
--   percent_change / dollar_change   present on exchange.metals and returned by
--                                    GET /spots/spot_prices. Their absence
--                                    would have changed the wire shape.
--   updated_at                       so "current" is a fact rather than an
--                                    assumption.
--   unique (metal_id)                one live quote per metal, enforced.
--
-- The duplicate rows are collapsed by keeping the lowest id per metal and
-- updating it from exchange, rather than deleting and reinserting, so the
-- surviving ids are stable. The rows removed are indistinguishable stale
-- snapshots with no timestamp - they carry no information that exchange.metals
-- does not hold more accurately. exchange is untouched.
--
-- scrap_percentage and bullion_percentage are deliberately not carried across.
-- They exist on exchange.metals but no code reads them; rate tiering comes from
-- rates.rates.

ALTER TABLE spots.spots
  ADD COLUMN IF NOT EXISTS percent_change numeric,
  ADD COLUMN IF NOT EXISTS dollar_change  numeric,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- uuid has no min(), so the survivor is chosen by ordering within each metal.
DELETE FROM spots.spots s
USING (
  SELECT id, row_number() OVER (PARTITION BY metal_id ORDER BY id) AS rn
  FROM spots.spots
) ranked
WHERE ranked.id = s.id AND ranked.rn > 1;

-- 2026-09-06: guarded. On a genesis build (ruling 82) the constraint is
-- already there, and ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spots_one_per_metal'
      AND conrelid = 'spots.spots'::regclass
  ) THEN
    ALTER TABLE spots.spots ADD CONSTRAINT spots_one_per_metal UNIQUE (metal_id);
  END IF;
END $$;

-- Bring the surviving rows in line with what exchange currently holds, and
-- create one for any metal that has no quote row at all.
INSERT INTO spots.spots (metal_id, ask, bid, percent_change, dollar_change)
SELECT m.id, e.ask_spot, e.bid_spot, e.percent_change, e.dollar_change
FROM exchange.metals e
-- 2026-09-06: 132 made metals.metals.id the metal's NAME and dropped `name`,
-- so on a genesis build `m.name` does not exist. coalesce reads whichever of
-- the two this database has, which keeps the join right on both shapes.
JOIN metals.metals m ON coalesce(to_jsonb(m) ->> 'name', m.id::text) = e.type
ON CONFLICT (metal_id) DO UPDATE SET
  ask            = EXCLUDED.ask,
  bid            = EXCLUDED.bid,
  percent_change = EXCLUDED.percent_change,
  dollar_change  = EXCLUDED.dollar_change,
  updated_at     = now();
