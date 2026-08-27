// exchange.images, and nothing else. THIS FILE IS SCHEDULED FOR DELETION.
//
// Writes only; reads come from media.images via repo.ts.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { NewImage, Executor } from "#features/media/images/repo.ts";

const sql = sqlFrom(import.meta.dirname);

// The id is the one media.images RETURNED, not a freshly generated one - see
// sql/create.sql. A retried upload therefore updates the same row on both sides.
export async function create(id: string, image: NewImage, executor?: Executor): Promise<void> {
  await query(
    sql("legacy/create"),
    [id, image.user_id, image.bucket, image.path, image.filename,
     image.mime_type ?? null, image.size_bytes ?? null],
    executor
  );
}

export async function remove(user_id: string, id: string, executor?: Executor): Promise<void> {
  await query(sql("legacy/delete"), [id, user_id], executor);
}
