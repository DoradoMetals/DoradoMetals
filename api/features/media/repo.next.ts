// Images read from the media schema.
//
// media.images calls one column `checksum` where exchange.images calls it
// `checksum_sha256`. Reads return the new name now and features/media/wire.ts
// converts down for the frontend, behind MEDIA_WIRE. The wire shape is
// unchanged - the better column name is a property of the new schema, not
// something callers have to learn about mid-migration.
//
// Reads project explicitly rather than SELECT *, so a column added to
// media.images cannot start appearing in responses by accident.
import query from "#shared/db/query.js";
import type { media } from "@dorado/contracts";
import type { PoolClient } from "pg";

// Repos take an optional executor so a caller can pull them into its
// transaction; without one they run on the pool.
type Executor = PoolClient | undefined;

// media.images calls one column `checksum` where exchange calls it
// checksum_sha256 - a rename and nothing else, handled by the wire adapter.
export type ImageRow = media.ImagesRow;

// What a caller supplies when recording an upload. The database fills id,
// created_at and the columns that carry defaults.
export type NewImage = Pick<ImageRow, "user_id" | "bucket" | "path" | "filename"> &
  Partial<Pick<ImageRow, "mime_type" | "size_bytes">>;


const FIELDS = `
    id, user_id, bucket, mime_type, size_bytes, width, height,
    checksum, metadata, created_at, path, filename
`;

export async function insertImage(
  { user_id, bucket, path, filename, mime_type, size_bytes }: NewImage,
  executor?: Executor
): Promise<ImageRow | undefined> {
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
  const { rows } = await query<ImageRow>(sql, values, executor);
  return rows[0];
}

export async function getImageById(
  id: string,
  executor?: Executor
): Promise<ImageRow | undefined> {
  const { rows } = await query<ImageRow>(
    `SELECT ${FIELDS} FROM media.images WHERE id = $1`,
    [id],
    executor
  );
  return rows[0];
}

// UNSCOPED BY DESIGN, and the route is requireAdmin because of it - this
// returns every image in the system, and the service attaches a presigned
// download URL to each. It was behind requireUser until a replay suite found it.
export async function getTestImages(executor?: Executor): Promise<ImageRow[]> {
  const { rows } = await query<ImageRow>(`SELECT ${FIELDS} FROM media.images`, [], executor);
  return rows ?? [];
}

export async function listImagesByUser(
  userId: string,
  executor?: Executor
): Promise<ImageRow[]> {
  const { rows } = await query<ImageRow>(
    `SELECT ${FIELDS} FROM media.images
     WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
    [userId],
    executor
  );
  return rows;
}

// Returns nothing, exactly as the exchange implementation does. repo.dual
// switches between the two, so their shapes have to match - typing this as
// returning a row would be a lie, and making it return one would change what
// the dual repo hands back depending on which switch is set.
export async function deleteImage(
  user_id: string,
  id: string,
  executor?: Executor
): Promise<void> {
  await query<ImageRow>(
    `DELETE FROM media.images WHERE id = $1 AND user_id = $2`,
    [id, user_id],
    executor
  );
}

// Copies a row from exchange.images, id included. Server-side, so no value is
// materialised in a client - a JS round trip would truncate created_at to
// millisecond precision.
export async function mirrorImage(id: string, executor?: Executor): Promise<ImageRow | undefined> {
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
  const { rows } = await query<ImageRow>(sql, [id], executor);
  return rows[0];
}
