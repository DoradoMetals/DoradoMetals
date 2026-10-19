INSERT INTO media.images
       (user_id, bucket, path, filename, mime_type, size_bytes, checksum)
VALUES ($1, $2, $3, $4, $5, $6, decode($7, 'hex'))
ON CONFLICT (path, filename, user_id) DO UPDATE SET
       bucket     = EXCLUDED.bucket,
       mime_type  = EXCLUDED.mime_type,
       size_bytes = EXCLUDED.size_bytes,
       checksum   = COALESCE(EXCLUDED.checksum, media.images.checksum)
RETURNING id, user_id, bucket, mime_type, size_bytes, width, height,
          encode(checksum, 'hex') AS checksum, metadata, created_at, path, filename
