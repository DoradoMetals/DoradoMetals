-- Every missing monthly partition of spots.ticks from this month through
-- next month (migration 273).
SELECT spots.add_tick_partitions(now() + interval '1 month') AS made
