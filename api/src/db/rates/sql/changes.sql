-- The rate change log: one page of eight, newest first, and the count over
-- every match. $1 search (metal or who changed it), $2 page. The band is the
-- one copied onto the change when it was made (migration 270), never today's.
WITH matched AS (
  SELECT h.id, h.rate_id, h.field, h.old_value, h.new_value, h.actor_id, h.actor_name,
         h.changed_at, h.metal_id, h.unit, h.min_qty, h.max_qty,
         CASE h.field WHEN 'scrap_pct' THEN 'scrap'
                      WHEN 'bullion_pct' THEN 'bullion'
                      ELSE 'band' END AS type
    FROM rates.rate_history h
   WHERE nullif(trim($1::text), '') IS NULL
      OR h.metal_id ILIKE '%' || trim($1::text) || '%'
      OR h.actor_name ILIKE '%' || trim($1::text) || '%'
),
page AS (
  SELECT m.*
    FROM matched m
   ORDER BY m.changed_at DESC, m.id ASC
   LIMIT 8 OFFSET (GREATEST($2::int, 1) - 1) * 8
)
SELECT jsonb_build_object(
         'total', (SELECT count(*)::int FROM matched),
         'page', GREATEST($2::int, 1),
         'page_size', 8,
         'items', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.changed_at DESC, p.id ASC)
                              FROM page p), '[]'::jsonb)) AS page
