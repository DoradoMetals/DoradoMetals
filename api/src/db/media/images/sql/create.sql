INSERT INTO media.images
       (user_id, bucket, path, filename, mime_type, size_bytes)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (path, filename, user_id) DO UPDATE SET
       bucket     = EXCLUDED.bucket,
       mime_type  = EXCLUDED.mime_type,
       size_bytes = EXCLUDED.size_bytes
RETURNING id, user_id, bucket, mime_type, size_bytes, width, height,
          checksum, metadata, created_at, path, filename
