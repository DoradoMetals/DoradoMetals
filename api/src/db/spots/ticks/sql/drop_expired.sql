-- Every monthly partition of spots.ticks that ended before
-- ticks_retention_days ago (migration 273).
SELECT spots.drop_expired_tick_partitions() AS dropped
