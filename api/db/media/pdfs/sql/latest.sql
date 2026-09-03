-- The order's documents, latest of a kind first - the read pdfs_order_kind_idx
-- exists to serve. Regeneration INSERTS rather than updating, so the newest
-- row IS the current document.
SELECT id, path, size_bytes, checksum, created_at
  FROM media.pdfs
 WHERE order_id = $1 AND kind = $2
 ORDER BY created_at DESC
 LIMIT 1
