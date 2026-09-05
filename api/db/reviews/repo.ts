import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf, ACTOR_IDS } from "#shared/db/columns.ts";
import { Review, ReviewPatch } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export const PATCHABLE = columnsOf(ReviewPatch);

const RETURNING = returningOf(
  Review.omit(Object.assign({ user_id: true, order_id: true } as const, ACTOR_IDS))
);

export async function getOne(id: string, executor?: Executor): Promise<Review | undefined> {
  const { rows } = await query<Review>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<Review[]> {
  const { rows } = await query<Review>(sql("get_all"), [], executor);
  return rows;
}

export async function getPublic(executor?: Executor): Promise<Review[]> {
  const { rows } = await query<Review>(sql("get_public"), [], executor);
  return rows;
}

export async function create(row: ReviewPatch, executor?: Executor): Promise<Review> {
  const { rows } = await query<Review>(
    sql("create"),
    [row.name, row.review_text, row.rating, row.hidden],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: ReviewPatch, executor?: Executor
): Promise<Review | undefined> {
  const built = buildUpdate({
    table: "reviews.reviews", allowed: PATCHABLE, patch, where: { id }, returning: RETURNING,
  });
  if (!built) return await getOne(id, executor);
  const { rows } = await query<Review>(built.text, built.values, executor);
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
