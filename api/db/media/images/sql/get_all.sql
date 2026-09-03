-- Every image, newest first - deterministically ordered; created_at is not unique, so id breaks the tie.
SELECT id, user_id, bucket, mime_type, size_bytes, width, height,
       checksum, metadata, created_at, path, filename
  FROM media.images
 ORDER BY created_at DESC, id DESC
