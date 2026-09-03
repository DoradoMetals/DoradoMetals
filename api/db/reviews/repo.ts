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
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { reviews } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ReviewRow = reviews.ReviewsRow;

// An explicit id wins on create; omitting one lets create.sql generate one.
export type NewReview = Partial<
  Pick<ReviewRow, "name" | "review_text" | "rating" | "hidden" | "created_by" | "updated_by">
> & { id?: string | null };

export type ReviewPatch = Partial<
  Pick<ReviewRow, "name" | "review_text" | "rating" | "hidden" | "created_by" | "updated_by">
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

export async function create(row: NewReview, executor?: Executor): Promise<ReviewRow> {
  const { rows } = await query<ReviewRow>(
    sql("create"),
    [
      row.id ?? null, row.name ?? null, row.review_text ?? null, row.rating ?? null,
      row.hidden ?? false, row.created_by ?? null, row.updated_by ?? null,
    ],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: ReviewPatch, executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql("update"),
    [
      patch.name ?? null, patch.review_text ?? null, patch.rating ?? null,
      patch.hidden ?? null, patch.created_by ?? null, patch.updated_by ?? null, id,
    ],
    executor
  );
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
