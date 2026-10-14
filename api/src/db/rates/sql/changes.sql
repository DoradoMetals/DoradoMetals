-- The rate change log: one row per band change and type (scrap, bullion),
-- newest first, eight a page,
-- and the count over every match. $1 search (metal, or the current name of who
-- changed it), $2 page. The name is searched, never returned (ruling 127): the
-- row carries actor_id alone.
-- rates.rate_history holds one row per changed field (migrations 270, 272);
-- the rows one trigger firing wrote share their changed_at, metal and band, so
-- they are grouped here into one change. old_band is the band before it (null
-- when the band was added), new_band the band after it (null when removed). A
-- percentage the change did not touch is read as it stood then: the band's
-- last logged value before the change, else its first logged old value after
-- it, else today's row.
WITH grouped AS (
  SELECT (array_agg(h.id ORDER BY h.id))[1] AS id,
         h.changed_at,
         h.metal_id,
         h.rate_id,
         max(h.unit) AS unit,
         max(h.min_qty) AS min_qty,
         max(h.max_qty) AS max_qty,
         (array_agg(h.actor_id ORDER BY h.id))[1] AS actor_id,
         jsonb_object_agg(h.field, jsonb_build_array(h.old_value, h.new_value)) AS f,
         bool_and(h.field IN ('scrap_pct', 'bullion_pct') AND h.old_value IS NULL) AS added,
         bool_and(h.field IN ('scrap_pct', 'bullion_pct') AND h.new_value IS NULL) AS removed
    FROM rates.rate_history h
   GROUP BY h.changed_at, h.metal_id, h.rate_id,
            CASE WHEN h.rate_id IS NULL THEN h.min_qty END,
            CASE WHEN h.rate_id IS NULL THEN h.max_qty END
),
held AS (
  SELECT g.id, fields.field,
         COALESCE(
           (SELECT x.new_value FROM rates.rate_history x
             WHERE x.rate_id = g.rate_id AND x.field = fields.field
               AND x.changed_at < g.changed_at
             ORDER BY x.changed_at DESC LIMIT 1),
           (SELECT x.old_value FROM rates.rate_history x
             WHERE x.rate_id = g.rate_id AND x.field = fields.field
               AND x.changed_at > g.changed_at
             ORDER BY x.changed_at ASC LIMIT 1),
           (SELECT to_jsonb(r) ->> fields.field FROM rates.rates r WHERE r.id = g.rate_id)
         )::numeric AS value
    FROM grouped g
   CROSS JOIN (VALUES ('scrap_pct'), ('bullion_pct')) AS fields(field)
),
banded AS (
  SELECT g.id, g.changed_at, g.metal_id, g.actor_id, g.added, g.removed, g.f,
         CASE WHEN g.added THEN NULL ELSE jsonb_build_object(
           'min_qty', COALESCE((g.f -> 'min_qty' ->> 0)::numeric, g.min_qty),
           'max_qty', CASE WHEN g.f ? 'max_qty' THEN (g.f -> 'max_qty' ->> 0)::numeric
                           ELSE g.max_qty END,
           'unit', COALESCE(g.f -> 'unit' ->> 0, g.unit),
           'scrap_pct', CASE WHEN g.f ? 'scrap_pct' THEN (g.f -> 'scrap_pct' ->> 0)::numeric
                             ELSE (SELECT h.value FROM held h
                                    WHERE h.id = g.id AND h.field = 'scrap_pct') END,
           'bullion_pct', CASE WHEN g.f ? 'bullion_pct' THEN (g.f -> 'bullion_pct' ->> 0)::numeric
                               ELSE (SELECT h.value FROM held h
                                      WHERE h.id = g.id AND h.field = 'bullion_pct') END)
         END AS old_band,
         CASE WHEN g.removed THEN NULL ELSE jsonb_build_object(
           'min_qty', g.min_qty,
           'max_qty', g.max_qty,
           'unit', g.unit,
           'scrap_pct', CASE WHEN g.f ? 'scrap_pct' THEN (g.f -> 'scrap_pct' ->> 1)::numeric
                             ELSE (SELECT h.value FROM held h
                                    WHERE h.id = g.id AND h.field = 'scrap_pct') END,
           'bullion_pct', CASE WHEN g.f ? 'bullion_pct' THEN (g.f -> 'bullion_pct' ->> 1)::numeric
                               ELSE (SELECT h.value FROM held h
                                      WHERE h.id = g.id AND h.field = 'bullion_pct') END)
         END AS new_band
    FROM grouped g
),
typed AS (
  SELECT b.id, kinds.type, b.changed_at, b.metal_id, b.actor_id,
         b.old_band, b.new_band
    FROM banded b
   CROSS JOIN (VALUES ('scrap', 'scrap_pct'), ('bullion', 'bullion_pct'))
           AS kinds(type, field)
   WHERE b.added OR b.removed OR b.f ? kinds.field
      OR b.f ?| ARRAY['metal_id', 'unit', 'min_qty', 'max_qty']
),
matched AS (
  SELECT t.*
    FROM typed t
   WHERE nullif(trim($1::text), '') IS NULL
      OR t.metal_id ILIKE '%' || trim($1::text) || '%'
      OR EXISTS (SELECT 1 FROM auth.users u
                  WHERE u.id = t.actor_id
                    AND u.name ILIKE '%' || trim($1::text) || '%')
),
page AS (
  SELECT m.*
    FROM matched m
   ORDER BY m.changed_at DESC, m.id ASC, m.type DESC
   LIMIT 8 OFFSET (GREATEST($2::int, 1) - 1) * 8
)
SELECT jsonb_build_object(
         'total', (SELECT count(*)::int FROM matched),
         'page', GREATEST($2::int, 1),
         'page_size', 8,
         'items', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.changed_at DESC, p.id ASC,
                                             p.type DESC)
                              FROM page p), '[]'::jsonb)) AS page
