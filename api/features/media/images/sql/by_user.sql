-- One user's images, newest first.
--
-- The index behind this is media.images (user_id, created_at), added in
-- migration 081 - the new schema had no index leading with user_id, so this
-- would have been a sequential scan the day MEDIA_SOURCE moved.
SELECT id, user_id, bucket, mime_type, size_bytes, width, height,
       checksum, metadata, created_at, path, filename
  FROM media.images
 WHERE user_id = $1
 ORDER BY created_at DESC, id DESC
