-- Minute candles past spots.settings.minute_candles_retention_days go. Hour
-- and day candles are kept.
WITH gone AS (
  DELETE FROM spots.candles c
   USING spots.settings s
   WHERE c.interval = '1m'
     AND c.bucket_start < now() - make_interval(days => s.minute_candles_retention_days)
  RETURNING 1
)
SELECT count(*)::int AS deleted FROM gone
