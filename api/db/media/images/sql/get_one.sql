-- One image, by id.
--
-- `checksum` is projected. media.images calls it that; exchange.images calls it
-- checksum_sha256, and wire.ts renames it at the edge under MEDIA_WIRE. It is a
-- rename rather than a new column, which is why it is here and not excluded the
-- way reviews' extra columns are.
SELECT id, user_id, bucket, mime_type, size_bytes, width, height,
       checksum, metadata, created_at, path, filename
  FROM media.images
 WHERE id = $1
