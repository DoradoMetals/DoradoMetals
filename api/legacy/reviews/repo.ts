// exchange.reviews, and nothing else. THIS FILE IS SCHEDULED FOR DELETION.
//
// Writes only. Reads come from reviews.reviews via repo.ts, which is the point
// of this phase: the new schema is exercised by real traffic while exchange
// stays a complete, current replica. Deleting this file and its calls in
// service.ts is the cutover, and that is a one-way door.
import query from "#shared/db/query.js";
import { sqlFrom } from "#shared/db/sql.ts";
import type { ReviewInput } from "#features/reviews/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

// Same order as sql/legacy/create.sql, which the generator emitted from the
// table's own column order.
const writable = (r: ReviewInput) => [
  r.name ?? null, r.review_text ?? null, r.rating ?? null,
  r.hidden ?? false, r.created_by ?? null, r.updated_by ?? null,
];

export async function create(id: string, review: ReviewInput, executor?: Executor): Promise<void> {
  await query(sql("create"), [id, ...writable(review)], executor);
}

export async function update(
  review: ReviewInput & { id: string },
  user_name: string,
  executor?: Executor
): Promise<void> {
  await query(
    sql("update"),
    [review.name ?? null, review.review_text ?? null, review.rating ?? null,
     review.hidden ?? false, review.created_by ?? null, user_name, review.id],
    executor
  );
}

export async function remove(id: string, executor?: Executor): Promise<void> {
  await query(sql("delete"), [id], executor);
}
