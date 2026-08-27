-- Every image, newest first.
--
-- DETERMINISTICALLY ORDERED, which the implementation this replaces was not: it
-- was `SELECT ... FROM media.images` with no ORDER BY at all, feeding an admin
-- screen in whatever physical order the heap happened to be in. Do not inherit
-- that - created_at is not unique, so id breaks the tie.
SELECT id, user_id, bucket, mime_type, size_bytes, width, height,
       checksum, metadata, created_at, path, filename
  FROM media.images
 ORDER BY created_at DESC, id DESC
