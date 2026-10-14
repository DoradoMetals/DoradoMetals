-- A QUOTE IS KEPT PER SOURCE, ITS HISTORY IS KEPT, AND A CHART READS CANDLES.
--
-- docs/model/spots-history.md, Jacob's rulings of 2026-10-14: quotes are
-- stored per source; history is kept; screens never read raw ticks.
--
-- spots.spots held one quote per metal with no source column, so falling back
-- to another feed could only relabel the price (FOLLOWUPS, Pricing API lane
-- leftovers). Three tables replace it as the resolver's input:
--
--   spots.current  the latest quote per (source, metal). Beyond the brief's
--                  five columns it keeps the provider's day change, which the
--                  card draws and spots.spots carried, and `seen_at`, the last
--                  poll that quoted the pair. `at` is when the pair was first
--                  quoted; a flat market leaves `at` alone and moves
--                  `seen_at`, so staleness reads `seen_at` and a quiet
--                  weekend with a live feed is not stale.
--   spots.ticks    append-only, one row per changed pair, range-partitioned
--                  by month on `at` with a BRIN index on `at`. Only the
--                  rollup reads it.
--   spots.candles  bid candles at 1m, 1h and 1d. The feed updates the open
--                  minute on a changed tick; hours roll up from closed minutes
--                  and days from closed hours. Buckets exist only where ticks
--                  exist. Bucket boundaries are UTC.
--
-- A partition is created by spots.add_tick_partitions(through), which makes
-- every missing month from the current one through `through`. The feed job and
-- the nightly job call it, so a tick never meets a month with no partition.
-- spots.drop_expired_tick_partitions() drops every month that ended before
-- ticks_retention_days ago. Both are plpgsql so genesis, which emits
-- functions before tables, can create them.
--
-- spots.settings gains the two retention figures (90 days of ticks, 365 of
-- minute candles); hour and day candles are kept.
--
-- THE BACKFILL copies each spots.spots row with a bid into spots.current under
-- nfusion, the only feed that ever wrote spots.spots, and opens one 1m, 1h and
-- 1d candle at its moment, so neither the resolver nor a chart reads empty.
-- Both are ON CONFLICT DO NOTHING: a replay never overwrites a newer quote.
-- spots.spots is not dropped here.
--
-- `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS spots.current (
  source_id text NOT NULL REFERENCES spots.sources(id) ON UPDATE CASCADE,
  metal_id text NOT NULL REFERENCES metals.metals(id) ON UPDATE CASCADE,
  bid numeric NOT NULL,
  ask numeric NOT NULL,
  dollar_change numeric,
  percent_change numeric,
  at timestamp with time zone NOT NULL,
  seen_at timestamp with time zone NOT NULL,
  CONSTRAINT current_pkey PRIMARY KEY (source_id, metal_id),
  CONSTRAINT current_seen_after_quoted CHECK (seen_at >= at)
);

CREATE INDEX IF NOT EXISTS current_metal_id_idx ON spots.current (metal_id);

CREATE TABLE IF NOT EXISTS spots.ticks (
  source_id text NOT NULL REFERENCES spots.sources(id) ON UPDATE CASCADE,
  metal_id text NOT NULL REFERENCES metals.metals(id) ON UPDATE CASCADE,
  at timestamp with time zone NOT NULL,
  bid numeric NOT NULL,
  ask numeric NOT NULL,
  CONSTRAINT ticks_pkey PRIMARY KEY (source_id, metal_id, at)
) PARTITION BY RANGE (at);

CREATE INDEX IF NOT EXISTS ticks_at_brin ON spots.ticks USING brin (at);

CREATE TABLE IF NOT EXISTS spots.candles (
  source_id text NOT NULL REFERENCES spots.sources(id) ON UPDATE CASCADE,
  metal_id text NOT NULL REFERENCES metals.metals(id) ON UPDATE CASCADE,
  interval text NOT NULL,
  bucket_start timestamp with time zone NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  ticks integer NOT NULL,
  CONSTRAINT candles_pkey PRIMARY KEY (source_id, metal_id, interval, bucket_start),
  CONSTRAINT candles_interval CHECK (interval IN ('1m', '1h', '1d')),
  CONSTRAINT candles_range CHECK (low <= open AND low <= close AND high >= open AND high >= close),
  CONSTRAINT candles_ticks_positive CHECK (ticks > 0)
);

CREATE INDEX IF NOT EXISTS candles_interval_bucket_start_idx
  ON spots.candles (interval, bucket_start);

ALTER TABLE spots.settings
  ADD COLUMN IF NOT EXISTS ticks_retention_days integer DEFAULT 90 NOT NULL,
  ADD COLUMN IF NOT EXISTS minute_candles_retention_days integer DEFAULT 365 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'spots_settings_positive_retention'
                    AND conrelid = 'spots.settings'::regclass) THEN
    ALTER TABLE spots.settings ADD CONSTRAINT spots_settings_positive_retention
      CHECK (ticks_retention_days > 0 AND minute_candles_retention_days > 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION spots.add_tick_partitions(through timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql
AS $add_tick_partitions$
DECLARE
  month timestamp without time zone := date_trunc('month', now() AT TIME ZONE 'UTC');
  last  timestamp without time zone := date_trunc('month', through AT TIME ZONE 'UTC');
  name  text;
  made  integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('spots.ticks partitions'));
  WHILE month <= last LOOP
    name := 'ticks_' || to_char(month, 'YYYY_MM');
    IF to_regclass('spots.' || name) IS NULL THEN
      EXECUTE format('CREATE TABLE spots.%I PARTITION OF spots.ticks FOR VALUES FROM (%L) TO (%L)',
                     name, month AT TIME ZONE 'UTC', (month + interval '1 month') AT TIME ZONE 'UTC');
      made := made + 1;
    END IF;
    month := month + interval '1 month';
  END LOOP;
  RETURN made;
END;
$add_tick_partitions$;

CREATE OR REPLACE FUNCTION spots.drop_expired_tick_partitions()
RETURNS integer
LANGUAGE plpgsql
AS $drop_expired_tick_partitions$
DECLARE
  cutoff  timestamp without time zone;
  part    text;
  dropped integer := 0;
BEGIN
  SELECT (now() AT TIME ZONE 'UTC') - make_interval(days => s.ticks_retention_days)
    INTO cutoff
    FROM spots.settings s
   LIMIT 1;
  IF cutoff IS NULL THEN
    RETURN 0;
  END IF;
  FOR part IN
    SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
     WHERE i.inhparent = 'spots.ticks'::regclass
       AND c.relname ~ '^ticks_[0-9]{4}_[0-9]{2}$'
       AND to_timestamp(substr(c.relname, 7), 'YYYY_MM')::date + interval '1 month' <= cutoff
  LOOP
    EXECUTE format('DROP TABLE spots.%I', part);
    dropped := dropped + 1;
  END LOOP;
  RETURN dropped;
END;
$drop_expired_tick_partitions$;

SELECT spots.add_tick_partitions(now() + interval '1 month');

INSERT INTO spots.current (source_id, metal_id, bid, ask, dollar_change, percent_change, at, seen_at)
SELECT 'nfusion', s.metal_id, s.bid, s.ask, s.dollar_change, s.percent_change, s.updated_at, s.updated_at
  FROM spots.spots s
 WHERE s.bid IS NOT NULL
   AND EXISTS (SELECT 1 FROM spots.sources src WHERE src.id = 'nfusion')
ON CONFLICT (source_id, metal_id) DO NOTHING;

INSERT INTO spots.candles (source_id, metal_id, interval, bucket_start, open, high, low, close, ticks)
SELECT c.source_id, c.metal_id, w.interval, date_trunc(w.unit, c.at, 'UTC'), c.bid, c.bid, c.bid, c.bid, 1
  FROM spots.current c
 CROSS JOIN (VALUES ('1m', 'minute'), ('1h', 'hour'), ('1d', 'day')) AS w(interval, unit)
 WHERE NOT EXISTS (SELECT 1 FROM spots.candles x
                    WHERE x.source_id = c.source_id AND x.metal_id = c.metal_id)
ON CONFLICT (source_id, metal_id, interval, bucket_start) DO NOTHING;
