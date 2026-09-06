SELECT id, path, size_bytes, checksum, created_at
  FROM media.pdfs
 WHERE refining_order_id = $1 AND kind = $2
 ORDER BY created_at DESC
 LIMIT 1
