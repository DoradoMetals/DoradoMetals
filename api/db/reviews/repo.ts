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
// NOBODY PASSES AN AUTHOR ANY MORE. created_by, updated_by, created_at and
// updated_at come from the public.audit_stamp trigger, which reads the actor
// off the connection (migration 116, shared/http/actor.ts). The `actor`
// argument is gone: create(row, tx?) and update(id, patch, tx?).
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { reviews } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type ReviewRow = reviews.ReviewsRow;

// An explicit id wins on create; omitting one lets create.sql generate one.
export type NewReview = Partial<
  Pick<ReviewRow, "name" | "review_text" | "rating" | "hidden">
> & { id?: string | null };

export const PATCHABLE = ["name", "review_text", "rating", "hidden"] as const;

export type ReviewPatch = Partial<Pick<ReviewRow, (typeof PATCHABLE)[number]>>;

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
    [row.id, row.name, row.review_text, row.rating, row.hidden],
    executor
  );
  return rows[0];
}

export async function update(
  id: string, patch: ReviewPatch, executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: "reviews.reviews", allowed: PATCHABLE, patch, where: { id },
  });
  if (!built) return true;
  const { rowCount } = await query(built.text, built.values, executor);
  return rowCount === 1;
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql("delete"), [id], executor);
  return rowCount === 1;
}
