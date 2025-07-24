const pool = require("../db");

async function insertImage({
  user_id,
  bucket,
  path,
  filename,
  mime_type,
  size_bytes,
}) {

  const query = `
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
  const { rows } = await pool.query(query, values);
  return rows[0];
}

async function getImageById(id) {
  const query = `
  SELECT * 
    FROM exchange.images 
    WHERE id = $1
  `
  const values = [id]
  const result = await pool.query(query, values)
  return result.rows[0];
}

async function getTestImages() {
  const result = await pool.query("SELECT * FROM exchange.images", []);

  return result?.rows ?? [];
}

async function listImagesByUser(userId) {
  const { rows } = await pool.query(
    "SELECT * FROM exchange.images WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return rows;
}

async function deleteImage(user_id, id) {
  await pool.query("DELETE FROM exchange.images WHERE id = $1 AND user_id = $2", [id, user_id]);
}

module.exports = {
  insertImage,
  getImageById,
  listImagesByUser,
  getTestImages,
  deleteImage,
};
