-- Hours roll up from CLOSED minutes: every 1m candle of this feed and metal
-- from the newest hour candle onwards whose minute has ended. Re-rolling an
-- hour that did not change writes nothing.
WITH since AS (
  SELECT COALESCE(max(h.bucket_start), '-infinity'::timestamptz) AS at
    FROM spots.candles h
   WHERE h.source_id = $1 AND h.metal_id = $2 AND h.interval = '1h'
),
rolled AS (
  SELECT date_trunc('hour', m.bucket_start, 'UTC') AS bucket_start,
         (array_agg(m.open ORDER BY m.bucket_start ASC))[1] AS open,
         max(m.high) AS high,
         min(m.low) AS low,
         (array_agg(m.close ORDER BY m.bucket_start DESC))[1] AS close,
         sum(m.ticks)::int AS ticks
    FROM spots.candles m
   CROSS JOIN since s
   WHERE m.source_id = $1
     AND m.metal_id = $2
     AND m.interval = '1m'
     AND m.bucket_start >= s.at
     AND m.bucket_start < date_trunc('minute', clock_timestamp(), 'UTC')
   GROUP BY 1
)
INSERT INTO spots.candles AS x
       (source_id, metal_id, interval, bucket_start, open, high, low, close, ticks)
SELECT $1, $2, '1h', r.bucket_start, r.open, r.high, r.low, r.close, r.ticks
  FROM rolled r
ON CONFLICT (source_id, metal_id, interval, bucket_start) DO UPDATE
   SET open = EXCLUDED.open,
       high = EXCLUDED.high,
       low = EXCLUDED.low,
       close = EXCLUDED.close,
       ticks = EXCLUDED.ticks
 WHERE (x.open, x.high, x.low, x.close, x.ticks)
       IS DISTINCT FROM (EXCLUDED.open, EXCLUDED.high, EXCLUDED.low, EXCLUDED.close, EXCLUDED.ticks)
