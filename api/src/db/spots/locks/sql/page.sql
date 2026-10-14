-- The lock list: one page of eight, newest first, and the count over every
-- matching lock. $1 metal, $2 status, $3 search, $4 page. The search matches
-- the order reference (PO-1234), the bare number, or who locked it.
WITH matched AS (
  SELECT v.*
    FROM (/*__view__*/) v
   WHERE ($1::text IS NULL OR v.metal_id = $1::text)
     AND ($2::text IS NULL OR v.status = $2::text)
     AND (nullif(trim($3::text), '') IS NULL
          OR v.reference ILIKE '%' || trim($3::text) || '%'
          OR v.locked_by ILIKE '%' || trim($3::text) || '%')
),
page AS (
  SELECT m.*
    FROM matched m
   ORDER BY m.created_at DESC, m.id ASC
   LIMIT 8 OFFSET (GREATEST($4::int, 1) - 1) * 8
)
SELECT jsonb_build_object(
         'total', (SELECT count(*)::int FROM matched),
         'page', GREATEST($4::int, 1),
         'page_size', 8,
         'items', COALESCE((SELECT jsonb_agg(to_jsonb(p)
                                       ORDER BY p.created_at DESC, p.id ASC)
                              FROM page p), '[]'::jsonb)) AS page
