-- A REBUILT SOURCE HAS A NAME TOO.
--
-- Genesis is dumped from dev and carries no triggers, so on a rebuild
-- spots.sources.name is NOT NULL before 240 and 277 insert their sources
-- without a name, and 279's trigger does not exist yet. A column default is
-- the one thing genesis does carry, so those inserts take it; 279 then sets
-- the three seeded names exactly as dev holds them. On dev the trigger names a
-- nameless row after its id first, so the default is never read there.
--
-- `exchange` is neither read nor written.

ALTER TABLE spots.sources ALTER COLUMN name SET DEFAULT 'Unnamed source';
