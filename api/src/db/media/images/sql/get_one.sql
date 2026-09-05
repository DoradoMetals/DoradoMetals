SELECT id, user_id, bucket, mime_type, size_bytes, width, height,
       checksum, metadata, created_at, path, filename
  FROM media.images
 WHERE id = $1
