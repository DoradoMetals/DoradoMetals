// Images read from the exchange schema, which currently serves traffic.
//
// Reads project explicitly rather than SELECT *, matching repo.next.ts, so the
// two return the same shape.
import query from "#shared/db/query.js";

const FIELDS = `
    id, user_id, bucket, mime_type, size_bytes, width, height,
    checksum_sha256 AS checksum, metadata, created_at, path, filename
`;

export async function insertImage(
  { user_id, bucket, path, filename, mime_type, size_bytes },
  executor
) {
  const sql = `
    INSERT INTO exchange.images (user_id, bucket, path, filename, mime_type, size_bytes)
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
  const sql = `
    SELECT ${FIELDS}
    FROM exchange.images
    WHERE id = $1
  `;
  const values = [id];
  const result = await query(sql, values, executor);
  return result.rows[0];
}

export async function getTestImages(executor) {
  const result = await query(`SELECT ${FIELDS} FROM exchange.images`, [], executor);
  return result?.rows ?? [];
}

export async function listImagesByUser(userId, executor) {
  const { rows } = await query(
    `SELECT ${FIELDS} FROM exchange.images WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
    [userId],
    executor
  );
  return rows;
}

export async function deleteImage(user_id, id, executor) {
  await query(
    'DELETE FROM exchange.images WHERE id = $1 AND user_id = $2',
    [id, user_id],
    executor
  );
}
