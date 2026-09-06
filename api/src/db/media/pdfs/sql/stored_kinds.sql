-- Which document kinds this order actually HAS a file for, newest per kind. The
-- Documents card offers Send on a row it can produce and Import on a row it
-- cannot, so a kind with no renderer becomes available the moment one is
-- imported (GAP 23/25).
SELECT DISTINCT ON (kind) kind, id
  FROM media.pdfs
 WHERE ($1::uuid IS NOT NULL AND order_id = $1::uuid)
    OR ($2::uuid IS NOT NULL AND refining_order_id = $2::uuid)
 ORDER BY kind, created_at DESC
