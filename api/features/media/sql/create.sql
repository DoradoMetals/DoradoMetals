-- Record an image.
--
-- AN UPSERT, because a client that retries an upload of the same object must
-- not create a second row: (path, filename, user_id) is unique and identifies
-- the object in storage.
--
-- The id is supplied by the service, and RETURNING id is what the caller must
-- use afterwards - on conflict it is the id of the row that ALREADY existed,
-- not the one just generated. That is what lets the legacy write agree on a
-- primary key without reading exchange back.
INSERT INTO media.images
       (id, user_id, bucket, path, filename, mime_type, size_bytes)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (path, filename, user_id) DO UPDATE SET
       bucket     = EXCLUDED.bucket,
       mime_type  = EXCLUDED.mime_type,
       size_bytes = EXCLUDED.size_bytes
RETURNING id, user_id, bucket, mime_type, size_bytes, width, height,
          checksum, metadata, created_at, path, filename
