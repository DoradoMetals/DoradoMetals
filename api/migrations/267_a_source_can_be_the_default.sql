-- ONE SOURCE IS THE DEFAULT, AND A METAL FOLLOWS IT UNLESS IT NAMES ANOTHER.
--
-- FOLLOWUPS "Pricing design review follow-ups" (2026-10-14), global default
-- spot source. The Spots page draws a Global Default card plus a per-metal
-- override; the API had only spots.active_sources, one row per metal. Jacob
-- ruled for a row-level fact: `is_default` on spots.sources, and a metal's
-- source is its active_sources row when one exists, else the default.
--
-- AT MOST ONE DEFAULT IS AN EXCLUSION CONSTRAINT, NOT A PARTIAL UNIQUE INDEX.
-- The PATCH that makes a source the default clears the old one in the same
-- UPDATE. A unique index that is not deferrable is checked row by row, so that
-- one statement fails or passes on the physical order of the two rows. An
-- index cannot be deferred; a constraint can, and EXCLUDE ... WHERE is the
-- constraint form of the partial unique index: equal `is_default` values may
-- not coexist among the rows where it is true. DEFERRABLE INITIALLY IMMEDIATE
-- moves the check to the end of the statement and no further.
--
-- "Exactly one" is the seed plus that PATCH: nothing clears a default except
-- making another source the default. nfusion is seeded as the default because
-- it is the one feed that exists, and only while no source is the default yet,
-- so a replay never moves a default an admin chose.
--
-- The four spots.active_sources rows migration 240 seeded all name nfusion and
-- carry no actor. They are overrides now, so those metals do not follow a
-- change of default until their row goes. They are NOT deleted here: deleting
-- configuration is Jacob's call (FOLLOWUPS).
--
-- `exchange` is neither read nor written.

ALTER TABLE spots.sources
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'sources_one_default'
                    AND conrelid = 'spots.sources'::regclass) THEN
    ALTER TABLE spots.sources ADD CONSTRAINT sources_one_default
      EXCLUDE USING btree (is_default WITH =) WHERE (is_default)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

UPDATE spots.sources
   SET is_default = true
 WHERE id = 'nfusion'
   AND NOT EXISTS (SELECT 1 FROM spots.sources d WHERE d.is_default);
