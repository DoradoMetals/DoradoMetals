// reviews.reviews, and nothing else.
//
// The projection excludes user_id, order_id, created_by_id and updated_by_id - never on this wire, said once as a contract omit rather than as a list of column names.
// getPublic is a genuinely separate read, not list() with a flag: security-critical, see get_public.sql.
// update takes an id and a patch and answers THE WRITTEN ROW (RETURNING); no per-column wrapper lives here.
// created_by, updated_by, created_at and updated_at come from the public.audit_stamp trigger, not passed as arguments.
import query from "#shared/db/query.ts";
import { buildUpdate } from "#shared/db/patch.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import { columnsOf, returningOf, ACTOR_IDS } from "#shared/db/columns.ts";
import { Review, ReviewPatch } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// THE COLUMNS, FROM THE CONTRACT (ruling 64) - the four a service writes.
export const PATCHABLE = columnsOf(ReviewPatch);

// What this wire carries: the row without its owner, its order or the actor ids.
const RETURNING = returningOf(
  Review.omit(Object.assign({ user_id: true, order_id: true } as const, ACTOR_IDS))
);

// An explicit id wins on create; omitting one lets create.sql generate one.
type ReviewCreate = ReviewPatch & { id?: string | null };

export async function getOne(id: string, executor?: Executor): Promise<Review | undefined> {
  const { rows } = await query<Review>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function list(executor?: Executor): Promise<Review[]> {
  const { rows } = await query<Review>(sql("get_all"), [], executor);
  return rows;
}

// Kept as its own statement, not list() with a filter: security-critical, see sql/get_public.sql.
export async function getPublic(executor?: Executor): Promise<Review[]> {
  const { rows } = await query<Review>(sql("get_public"), [], executor);
  return rows;
}

export async function create(row: ReviewCreate, executor?: Executor): Promise<Review> {
  const { rows } = await query<Review>(
    sql("create"),
    [row.id, row.name, row.review_text, row.rating, row.hidden],
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
