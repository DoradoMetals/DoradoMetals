-- One feed's quote for one metal, from one poll. The pair is always written
-- to spots.current with `seen_at`, the poll's moment; `at` moves only when the
-- bid or the ask did. A moved pair also appends one spots.ticks row and
-- updates the open 1m bid candle. A pair that did not move writes no tick and
-- no candle (migration 273). The poll's moment is clock_timestamp(), taken
-- once, so two polls inside one transaction are still two moments.
WITH clock AS (
  SELECT clock_timestamp() AS at
),
prior AS (
  SELECT c.bid, c.ask
    FROM spots.current c
   WHERE c.source_id = $1 AND c.metal_id = $2
),
moved AS (
  SELECT NOT EXISTS (SELECT 1 FROM prior p
                      WHERE p.bid = $3::numeric AND p.ask = $4::numeric) AS changed
),
quote AS (
  INSERT INTO spots.current AS c
         (source_id, metal_id, bid, ask, dollar_change, percent_change, at, seen_at)
  SELECT $1, $2, $3::numeric, $4::numeric, $5::numeric, $6::numeric, k.at, k.at
    FROM clock k
  ON CONFLICT (source_id, metal_id) DO UPDATE
     SET bid = EXCLUDED.bid,
         ask = EXCLUDED.ask,
         dollar_change = EXCLUDED.dollar_change,
         percent_change = EXCLUDED.percent_change,
         at = CASE WHEN c.bid = EXCLUDED.bid AND c.ask = EXCLUDED.ask THEN c.at
                   ELSE EXCLUDED.at END,
         seen_at = EXCLUDED.seen_at
  RETURNING c.source_id
),
tick AS (
  INSERT INTO spots.ticks (source_id, metal_id, at, bid, ask)
  SELECT $1, $2, k.at, $3::numeric, $4::numeric
    FROM clock k, moved m
   WHERE m.changed
  ON CONFLICT (source_id, metal_id, at) DO NOTHING
  RETURNING at
),
minute AS (
  INSERT INTO spots.candles AS x
         (source_id, metal_id, interval, bucket_start, open, high, low, close, ticks)
  SELECT $1, $2, '1m', date_trunc('minute', k.at, 'UTC'),
         $3::numeric, $3::numeric, $3::numeric, $3::numeric, 1
    FROM clock k, moved m
   WHERE m.changed
  ON CONFLICT (source_id, metal_id, interval, bucket_start) DO UPDATE
     SET high = GREATEST(x.high, EXCLUDED.high),
         low = LEAST(x.low, EXCLUDED.low),
         close = EXCLUDED.close,
         ticks = x.ticks + 1
  RETURNING x.bucket_start
)
SELECT m.changed,
       (SELECT count(*) FROM quote)::int AS quoted,
       (SELECT count(*) FROM tick)::int AS ticked
  FROM moved m
