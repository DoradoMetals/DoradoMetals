-- runs-even-under-a-baseline: 281 carries an EXECUTE, so a baseline replays
--   it and its DROP COLUMN; this restores the three dead columns after it on
--   every rebuilt database, so the rebuild ends on the shape dev holds.
--
-- THE REBUILD KEEPS A DEAD actor_name, NULLABLE AND UNUSED.
--
-- verify:replay found it. Under a baseline the runner replays the DDL of the
-- migrations that carry data (242, 268, 269, 270, 272, 277). Their old
-- trigger bodies write actor_name, and 274's DELETE on spots.active_sources
-- fires one before 281 can run. With the column gone from genesis, the
-- rebuild stopped at 274.
--
-- So the three columns come back: nullable, no default. Nothing reads or
-- writes them. 281's trigger bodies stand and write no name; no read
-- selects the column and no contract view carries it (ruling 127). On a
-- rebuild, the replayed old bodies write it until 281 replaces them.
--
-- The columns are dropped once the runner replays only the row statements
-- of a covered data migration (FOLLOWUPS.md).
--
-- `exchange` is neither read nor written.

ALTER TABLE rates.rate_history ADD COLUMN IF NOT EXISTS actor_name text;
ALTER TABLE spots.adjustment_history ADD COLUMN IF NOT EXISTS actor_name text;
ALTER TABLE spots.source_events ADD COLUMN IF NOT EXISTS actor_name text;
