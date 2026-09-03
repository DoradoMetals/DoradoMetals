// reviews.reviews, and nothing else.
//
// A repo owns exactly one table: it does not join, and it does not shape
// anything for a client. The row type comes from the generated contract, so it
// is whatever the database says rather than a hand-written guess.
//
// The projection excludes user_id, order_id, created_by_id and updated_by_id -
// columns reviews.reviews has that have never been on this wire.
//
// getPublic is a genuinely separate READ, not list() with a flag - see its own
// header. update takes an id and a patch and answers whether a row changed
// (D212's CRUD ruling); no per-column wrapper lives here.
//
// created_by/updated_by are NOT in NewReview/ReviewPatch - they are not the
// client's to set. Both create and update take a separate ACTOR argument, and
// the SQL writes it into created_by (on insert, fixed thereafter) / updated_by
// (on every update). update.sql no longer touches created_by at all - once
// set at creation it does not move.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { reviews } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ReviewRow = reviews.ReviewsRow;

// An explicit id wins on create; omitting one lets create.sql generate one.
export type NewReview = Partial<
  Pick<ReviewRow, "name" | "review_text" | "rating" | "hidden">
> & { id?: string | null };

export type ReviewPatch = Partial<
  Pick<ReviewRow, "name" | "review_text" | "rating" | "hidden">
>;

export async function getOne(id: string, executor?: Executor): Promise<ReviewRow | undefined> {
  const { rows } = await query<ReviewRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<ReviewRow[]> {
  const { rows } = await query<ReviewRow>(sql("get_all"), [], executor);
  return rows;
}

// Separate statement, not list() with a filter. See sql/get_public.sql.
export async function getPublic(executor?: Executor): Promise<ReviewRow[]> {
  const { rows } = await query<ReviewRow>(sql("get_public"), [], executor);
  return rows;
}

export async function create(
  row: NewReview, actor?: string | null, executor?: Executor
): Promise<ReviewRow> {
  const { rows } = await query<ReviewRow>(
    sql("create"),
    [row.id, row.name, row.review_text, row.rating, row.hidden, actor, actor],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: ReviewPatch, actor?: string | null, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql("update"),
    [patch.name, patch.review_text, patch.rating, patch.hidden, actor, id],
    executor
  );
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
