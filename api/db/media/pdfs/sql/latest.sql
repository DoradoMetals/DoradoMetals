-- Latest document of a kind for an order (served by pdfs_order_kind_idx) - regeneration INSERTS, so the newest row IS the current document.
SELECT id, path, size_bytes, checksum, created_at
  FROM media.pdfs
 WHERE order_id = $1 AND kind = $2
 ORDER BY created_at DESC
 LIMIT 1
