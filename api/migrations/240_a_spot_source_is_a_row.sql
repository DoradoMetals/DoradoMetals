-- A SPOT FEED IS A ROW, AND A METAL SAYS WHICH ONE IT READS.
--
-- docs/waves/pricing-resolver.md item 2, from the Pricing audit
-- (docs/design/api-gaps-pricing.md section 1 rows 1-5, 11, 12, 13). The Spots
-- screen draws several named feeds, a Live/Standby/Off status per feed, a last
-- tick per feed and a per-metal active source. None of those facts existed:
-- spots.spots was one quote per metal with no source column at all, and the
-- feed was an HTTP call written straight into it.
--
-- WHY A TABLE AND NOT AN ENUM. Jacob's model is "adjustments are per metal per
-- source, active source spot per metal", and a source carries mutable state -
-- enabled, a sort order, the moment of its last tick. Ruling 116: a business
-- set is rows.
--
-- The status (Live / Standby / Off) is NOT a column. It is a CASE in
-- db/spots/sources/sql/get_all.sql over `enabled` and whether any metal names
-- this source, exactly as ruling 112 requires.
--
-- last_attempt_at AND last_tick_at BOTH EXIST so "off, never polled" differs
-- from "polled and failed": the feed job stamps the attempt before it calls
-- out and the tick after it writes. last_error is read by the sources list and
-- is not written yet - filling it needs a catch around the provider call, and
-- lint:one-catch forbids one in a domain file.
--
-- metals.metals.sort_order replaces the array_position literal that ordered
-- db/spots/sql/get_all.sql. 999 is the default so a metal nobody has placed
-- sorts last rather than first.
--
-- `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS spots.sources (
  id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 999,
  last_tick_at timestamp with time zone,
  last_attempt_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by text DEFAULT '' NOT NULL,
  updated_by text DEFAULT '' NOT NULL,
  created_by_id uuid REFERENCES auth.users(id),
  updated_by_id uuid REFERENCES auth.users(id)
);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON spots.sources
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO spots.sources (id, enabled, sort_order)
VALUES ('nfusion', true, 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS spots.active_sources (
  metal_id text PRIMARY KEY REFERENCES metals.metals(id) ON UPDATE CASCADE,
  source_id text NOT NULL REFERENCES spots.sources(id) ON UPDATE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by text DEFAULT '' NOT NULL,
  updated_by text DEFAULT '' NOT NULL,
  created_by_id uuid REFERENCES auth.users(id),
  updated_by_id uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS active_sources_source_id_idx
  ON spots.active_sources (source_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON spots.active_sources
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO spots.active_sources (metal_id, source_id)
SELECT m.id, 'nfusion' FROM metals.metals m
ON CONFLICT (metal_id) DO NOTHING;

ALTER TABLE metals.metals
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 999 NOT NULL;

UPDATE metals.metals m
   SET sort_order = v.n
  FROM (VALUES ('Gold', 1), ('Silver', 2), ('Platinum', 3), ('Palladium', 4)) AS v(id, n)
 WHERE m.id = v.id
   AND m.sort_order IS DISTINCT FROM v.n;

-- The tick interval was SPOT_UPDATE_SCHEDULE, a cron string in an env var, for
-- a figure the business sets. spots.settings already holds the staleness
-- threshold and is where this belongs (ruling 116).
ALTER TABLE spots.settings
  ADD COLUMN IF NOT EXISTS tick_seconds integer DEFAULT 30 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'spots_settings_positive_tick'
                    AND conrelid = 'spots.settings'::regclass) THEN
    ALTER TABLE spots.settings ADD CONSTRAINT spots_settings_positive_tick
      CHECK (tick_seconds > 0 AND tick_seconds <= 3600);
  END IF;
END $$;

-- A bid and an ask move by the same dollars off one underlying tick, so the
-- PERCENT differs between them: the base differs. Four columns because the
-- card draws a change under bid and a different one under ask (audit row 13);
-- all four are nullable because the feed may quote a metal with no prior tick.
ALTER TABLE spots.spots
  ADD COLUMN IF NOT EXISTS bid_dollar_change numeric,
  ADD COLUMN IF NOT EXISTS bid_percent_change numeric,
  ADD COLUMN IF NOT EXISTS ask_dollar_change numeric,
  ADD COLUMN IF NOT EXISTS ask_percent_change numeric;
