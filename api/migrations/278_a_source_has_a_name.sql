-- A SOURCE HAS A NAME.
--
-- The Sources card, the Global Default picker and the metal page's Source
-- picker draw "nFusion Solutions", "Kitco" and "LBMA". spots.sources had only
-- its lowercase id, so the screens printed the key. The name is a fact about
-- the row and lives in the database: added nullable, set for the three rows
-- this schema seeds, then made NOT NULL. A source with no seeded name takes
-- its id, so the constraint never meets a NULL.
--
-- The screens' "next market open" needs no new function: spots.next_market_open
-- (after) already answers it and the board passes now().
--
-- `exchange` is neither read nor written.

ALTER TABLE spots.sources ADD COLUMN IF NOT EXISTS name text;

UPDATE spots.sources
   SET name = CASE id WHEN 'nfusion' THEN 'nFusion Solutions'
                      WHEN 'kitco' THEN 'Kitco'
                      WHEN 'lbma' THEN 'LBMA'
                      ELSE id END
 WHERE name IS NULL;

ALTER TABLE spots.sources ALTER COLUMN name SET NOT NULL;
