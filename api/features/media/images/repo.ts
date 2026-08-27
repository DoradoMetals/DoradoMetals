// media.images, and nothing else.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { media } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type ImageRow = media.ImagesRow;
export type Executor = PoolClient | undefined;

export type NewImage = {
  user_id: string;
  bucket: string;
  path: string;
  filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
};

const values = (id: string, i: NewImage) => [
  id, i.user_id, i.bucket, i.path, i.filename, i.mime_type ?? null, i.size_bytes ?? null,
];

export async function getOne(id: string, executor?: Executor): Promise<ImageRow | undefined> {
  const { rows } = await query<ImageRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getAll(executor?: Executor): Promise<ImageRow[]> {
  const { rows } = await query<ImageRow>(sql("get_all"), [], executor);
  return rows;
}

export async function byUser(userId: string, executor?: Executor): Promise<ImageRow[]> {
  const { rows } = await query<ImageRow>(sql("by_user"), [userId], executor);
  return rows;
}

// Returns the row that now exists - which on conflict is the one that ALREADY
// existed, under its own id rather than the one just generated. Callers must
// use the returned id, not the one they passed.
export async function create(id: string, image: NewImage, executor?: Executor): Promise<ImageRow> {
  const { rows } = await query<ImageRow>(sql("create"), values(id, image), executor);
  return rows[0];
}

export async function remove(user_id: string, id: string, executor?: Executor): Promise<number> {
  const result = await query(sql("delete"), [id, user_id], executor);
  return result.rowCount ?? 0;
}
