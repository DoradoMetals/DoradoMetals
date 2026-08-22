-- Restore the provenance columns media.images dropped.
--
-- exchange.images records who uploaded a file and when. media.images kept
-- neither, which is not a simplification: listImagesByUser filters on user_id,
-- so an image with no owner is unreachable through the API, and without
-- created_at there is no way to order or expire an upload.
--
--   user_id      who uploaded it, with a foreign key this time. exchange has
--                the column but no constraint, so nothing stopped it holding an
--                id that never existed.
--   created_at   when. NOT NULL with a default, matching exchange.
--   metadata     regains the '{}' default, so an insert that omits it gets an
--                empty object rather than NULL and callers can index into it
--                without a guard.
--
-- checksum_sha256 is deliberately not restored: media.images calls the same
-- column `checksum`, which is the better name - the algorithm is not part of
-- what the column means, and pinning it in the name is how you end up with
-- checksum_sha256 holding a sha512. The backfill maps one to the other.
--
-- Additive. exchange is untouched.

ALTER TABLE media.images
  ADD COLUMN IF NOT EXISTS user_id    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE media.images
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

INSERT INTO media.images (
  id, user_id, bucket, mime_type, size_bytes, width, height,
  checksum, metadata, created_at, path, filename
)
SELECT
  e.id, e.user_id, e.bucket, e.mime_type, e.size_bytes, e.width, e.height,
  e.checksum_sha256, e.metadata, e.created_at, e.path, e.filename
FROM exchange.images e
ON CONFLICT (id) DO UPDATE SET
  user_id    = EXCLUDED.user_id,
  bucket     = EXCLUDED.bucket,
  mime_type  = EXCLUDED.mime_type,
  size_bytes = EXCLUDED.size_bytes,
  width      = EXCLUDED.width,
  height     = EXCLUDED.height,
  checksum   = EXCLUDED.checksum,
  metadata   = EXCLUDED.metadata,
  created_at = EXCLUDED.created_at,
  path       = EXCLUDED.path,
  filename   = EXCLUDED.filename;
