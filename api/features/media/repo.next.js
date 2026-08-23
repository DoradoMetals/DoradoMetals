// Images read from the media schema.
//
// media.images calls one column `checksum` where exchange.images calls it
// `checksum_sha256`. Reads return the new name now and features/media/wire.js
// converts down for the frontend, behind MEDIA_WIRE. The wire shape is
// unchanged - the better column name is a property of the new schema, not
// something callers have to learn about mid-migration.
//
// Reads project explicitly rather than SELECT *, so a column added to
// media.images cannot start appearing in responses by accident.
import query from "#shared/db/query.js";

const FIELDS = `
    id, user_id, bucket, mime_type, size_bytes, width, height,
    checksum, metadata, created_at, path, filename
`;

export async function insertImage(
  { user_id, bucket, path, filename, mime_type, size_bytes },
  executor
) {
  const sql = `
    INSERT INTO media.images (user_id, bucket, path, filename, mime_type, size_bytes)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (path, filename, user_id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      bucket = EXCLUDED.bucket,
      path = EXCLUDED.path,
      filename = EXCLUDED.filename,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes
    RETURNING ${FIELDS};
  `;
  const values = [
    user_id,
    bucket,
    path,
    filename,
    mime_type || null,
    size_bytes || null,
  ];
  const { rows } = await query(sql, values, executor);
  return rows[0];
}

export async function getImageById(id, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} FROM media.images WHERE id = $1`,
    [id],
    executor
  );
  return rows[0];
}

export async function getTestImages(executor) {
  const { rows } = await query(`SELECT ${FIELDS} FROM media.images`, [], executor);
  return rows ?? [];
}

export async function listImagesByUser(userId, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} FROM media.images
     WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
    [userId],
    executor
  );
  return rows;
}

export async function deleteImage(user_id, id, executor) {
  await query(
    `DELETE FROM media.images WHERE id = $1 AND user_id = $2`,
    [id, user_id],
    executor
  );
}

// Copies a row from exchange.images, id included. Server-side, so no value is
// materialised in a client - a JS round trip would truncate created_at to
// millisecond precision.
export async function mirrorImage(id, executor) {
  const sql = `
    INSERT INTO media.images (
      id, user_id, bucket, mime_type, size_bytes, width, height,
      checksum, metadata, created_at, path, filename
    )
    SELECT
      e.id, e.user_id, e.bucket, e.mime_type, e.size_bytes, e.width, e.height,
      e.checksum_sha256, e.metadata, e.created_at, e.path, e.filename
    FROM exchange.images e
    WHERE e.id = $1
    ON CONFLICT (id) DO UPDATE SET
      user_id = EXCLUDED.user_id, bucket = EXCLUDED.bucket,
      mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes,
      width = EXCLUDED.width, height = EXCLUDED.height,
      checksum = EXCLUDED.checksum, metadata = EXCLUDED.metadata,
      created_at = EXCLUDED.created_at, path = EXCLUDED.path,
      filename = EXCLUDED.filename
    RETURNING ${FIELDS};
  `;
  const { rows } = await query(sql, [id], executor);
  return rows[0];
}
