-- Record an image. Upsert: (path, filename, user_id) is unique, so a retried upload doesn't create a second row.
-- RETURNING id is the caller's id to use afterward - on conflict it's the ALREADY-existing row's, not the one just generated.
INSERT INTO media.images
       (id, user_id, bucket, path, filename, mime_type, size_bytes)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (path, filename, user_id) DO UPDATE SET
       bucket     = EXCLUDED.bucket,
       mime_type  = EXCLUDED.mime_type,
       size_bytes = EXCLUDED.size_bytes
RETURNING id, user_id, bucket, mime_type, size_bytes, width, height,
          checksum, metadata, created_at, path, filename
