-- Two rows in refiners.items carry content = 'NaN'.
--
-- The chain, fully established across D47/D48/D61/D65: the legacy scrap update
-- computed `convertTroyOz(post_melt_actual ?? pre_melt, unit) * purity_actual`
-- with a ?? fallback that operator precedence made unreachable, so an
-- unmeasured purity yielded undefined * n = NaN. Postgres NUMERIC accepts NaN,
-- so it stored. JSON cannot represent it, so every jsonb-composed read returns
-- the STRING "NaN" - the same stored value is a number on a flat SELECT and a
-- string through composition, and arithmetic on it concatenates. validate:wire
-- fails on exactly these two rows, on both read paths.
--
-- NULL is what these columns already mean by "not measured", and that is what
-- an uncomputable content is. The write path now refuses to store a non-finite
-- value (features/scrap/repo.ts), so these two are the last.
--
-- Production was measured before this was written: audit:non-finite reports
-- every visible numeric column finite there (refiners is fully visible to the
-- audit role), so this UPDATE moves nothing in prod. Dev is where the two rows
-- live. Not destructive to exchange; refiners.items is the new schema.

UPDATE refiners.items
   SET content = NULL
 WHERE content = 'NaN'::numeric;
