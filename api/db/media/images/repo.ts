// media.images. NO update() - an upload record is written once and never edited; only upload-new or delete change it.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { Image } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ImageRow = Image;

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

export async function list(executor?: Executor): Promise<ImageRow[]> {
  const { rows } = await query<ImageRow>(sql("get_all"), [], executor);
  return rows;
}

export async function listFor(userId: string, executor?: Executor): Promise<ImageRow[]> {
  const { rows } = await query<ImageRow>(sql("by_user"), [userId], executor);
  return rows;
}

// On conflict, returns the row that ALREADY existed under its own id - callers must use the returned id, not the one they passed.
export async function create(id: string, image: NewImage, executor?: Executor): Promise<ImageRow> {
  const { rows } = await query<ImageRow>(sql("create"), values(id, image), executor);
  return rows[0];
}

// user_id is part of the WHERE - the ownership check belongs in the statement, not just the service (see sql/delete.sql).
export async function remove(
  id: string, user_id: string, executor?: Executor
): Promise<boolean> {
  const result = await query(sql("delete"), [id, user_id], executor);
  return result.rowCount === 1;
}
