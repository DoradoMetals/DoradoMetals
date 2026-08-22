import query from "#shared/db/query.js";

export async function insertImage({
  user_id,
  bucket,
  path,
  filename,
  mime_type,
  size_bytes,
}) {
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
    RETURNING *;
  `;
  const values = [
    user_id,
    bucket,
    path,
    filename,
    mime_type || null,
    size_bytes || null,
  ];
  const { rows } = await query(sql, values);
  return rows[0];
}

export async function getImageById(id) {
  const sql = `
    SELECT * 
    FROM exchange.images 
    WHERE id = $1
  `;
  const values = [id];
  const result = await query(sql, values);
  return result.rows[0];
}

export async function getTestImages() {
  const result = await query('SELECT * FROM exchange.images', []);
  return result?.rows ?? [];
}

export async function listImagesByUser(userId) {
  const { rows } = await query(
    'SELECT * FROM exchange.images WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
    [userId]
  );
  return rows;
}

export async function deleteImage(user_id, id) {
  await query(
    'DELETE FROM exchange.images WHERE id = $1 AND user_id = $2',
    [id, user_id]
  );
}
