// reviews.reviews, and nothing else.
//
// A repo owns exactly one table: it does not join, and it does not shape
// anything for a client. The row type comes from the generated contract, so it
// is whatever the database says rather than a hand-written guess.
//
// The projection excludes user_id, order_id, created_by_id and updated_by_id -
// columns reviews.reviews has and exchange.reviews does not. While both schemas
// serve, a column only one of them has must not reach the wire, or the response
// shape depends on which schema answered.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { reviews } from "@dorado/contracts";
import type { PoolClient } from "pg";

const sql = sqlFrom(import.meta.dirname);

export type ReviewRow = reviews.ReviewsRow;
export type Executor = PoolClient | undefined;

export type ReviewInput = Partial<
  Pick<ReviewRow, "review_text" | "rating" | "created_by" | "updated_by" | "name" | "hidden">
>;

// ORDER MATCHES sql/create.sql AND sql/update.sql, which the generator emitted
// from the table's own column order. Writing these by hand against generated
// SQL is the one transcription error the generator cannot prevent - and it
// caught me once already, so tests/unit.test.ts asserts the two agree.
const writable = (r: ReviewInput) => [
  r.name ?? null,
  r.review_text ?? null,
  r.rating ?? null,
  r.hidden ?? false,
  r.created_by ?? null,
  r.updated_by ?? null,
];

export async function getOne(id: string, executor?: Executor): Promise<ReviewRow | undefined> {
  const { rows } = await query<ReviewRow>(sql("get_one"), [id], executor);
  return rows[0];
}

export async function getAll(executor?: Executor): Promise<ReviewRow[]> {
  const { rows } = await query<ReviewRow>(sql("get_all"), [], executor);
  return rows;
}

// Separate statement, not get_all with a filter. See sql/get_public.sql.
export async function getPublic(executor?: Executor): Promise<ReviewRow[]> {
  const { rows } = await query<ReviewRow>(sql("get_public"), [], executor);
  return rows;
}

export async function create(id: string, review: ReviewInput, executor?: Executor): Promise<ReviewRow> {
  const { rows } = await query<ReviewRow>(sql("create"), [id, ...writable(review)], executor);
  return rows[0];
}

export async function update(
  review: ReviewInput & { id: string },
  user_name: string,
  executor?: Executor
): Promise<ReviewRow | undefined> {
  const { rows } = await query<ReviewRow>(
    sql("update"),
    [review.name ?? null,
     review.review_text ?? null,
     review.rating ?? null,
     review.hidden ?? false,
     review.created_by ?? null,
     user_name,               // updated_by is the caller, not the payload
     review.id],
    executor
  );
  return rows[0];
}

export async function remove(id: string, executor?: Executor): Promise<number> {
  const result = await query(sql("delete"), [id], executor);
  return result.rowCount ?? 0;
}
