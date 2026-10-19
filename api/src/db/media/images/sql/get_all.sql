SELECT id, user_id, bucket, mime_type, size_bytes, width, height,
       encode(checksum, 'hex') AS checksum, metadata, created_at, path, filename
  FROM media.images
 ORDER BY created_at DESC, id DESC
