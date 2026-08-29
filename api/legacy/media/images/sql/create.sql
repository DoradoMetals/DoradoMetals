-- The same image, in the schema still serving as the record of truth.
--
-- checksum_sha256 is exchange's name for what media.images calls `checksum`.
-- Neither is written here: it is populated elsewhere, and this statement
-- records the object, not its digest.
--
-- The id is supplied by the caller and is whatever the new schema RETURNED, so
-- a retried upload updates the same row on both sides.
INSERT INTO exchange.images
       (id, user_id, bucket, path, filename, mime_type, size_bytes)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (id) DO UPDATE SET
       bucket     = EXCLUDED.bucket,
       mime_type  = EXCLUDED.mime_type,
       size_bytes = EXCLUDED.size_bytes
RETURNING id
