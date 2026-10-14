-- A metal's bid candles for one chart range: 1D reads minutes, 1W and 1M read
-- hours, 1Y reads days. The feed is $2 when given, else the metal's resolved
-- source. The window ends at the newest candle of that interval, not now(),
-- so a closed market still draws its last session.
WITH pick AS (
  SELECT CASE $3::text WHEN '1D' THEN '1m' WHEN '1Y' THEN '1d' ELSE '1h' END AS interval,
         CASE $3::text WHEN '1D' THEN interval '1 day'
                       WHEN '1W' THEN interval '7 days'
                       WHEN '1M' THEN interval '1 month'
                       ELSE interval '1 year' END AS span
),
feed AS (
  SELECT COALESCE($2::text, r.source_id) AS id
    FROM spots.resolved r
   WHERE r.metal_id = $1
),
newest AS (
  SELECT max(c.bucket_start) AS at
    FROM spots.candles c, pick p, feed f
   WHERE c.source_id = f.id AND c.metal_id = $1 AND c.interval = p.interval
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
         'bucket_start', c.bucket_start,
         'open', c.open,
         'high', c.high,
         'low', c.low,
         'close', c.close,
         'ticks', c.ticks) ORDER BY c.bucket_start ASC), '[]'::jsonb) AS candles
  FROM spots.candles c
 CROSS JOIN pick p
 CROSS JOIN feed f
 CROSS JOIN newest n
 WHERE c.source_id = f.id
   AND c.metal_id = $1
   AND c.interval = p.interval
   AND c.bucket_start > n.at - p.span
