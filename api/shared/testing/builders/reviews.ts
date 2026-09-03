// aReview - a customer review.
//
// THE ORDER AND THE AUTHOR ARE COLUMNS THE REPO DOES NOT WRITE. `create` takes
// name/text/rating/hidden only, because a review arrives from a form; user_id
// and order_id are set by whatever links it to an order. A builder that wants
// a review OF an order therefore writes them afterwards, and does so through
// the same client so the row stays inside the caller's transaction.
import type { PoolClient } from "pg";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as reviews from "#db/reviews/repo.ts";
import type { BuiltOrder } from "#shared/testing/builders/orders.ts";

export type ReviewOptions = {
  id?: string;
  name?: string;
  review_text?: string;
  rating?: number;
  hidden?: boolean;
  user?: { id: string } | null;
};

export async function aReview(
  c: PoolClient, order?: BuiltOrder | { id: string; user_id?: string | null } | null,
  options: ReviewOptions = {}
) {
  const tag = aTag();
  const row = await reviews.create(
    {
      id: options.id ?? anId(),
      name: options.name ?? `Test Reviewer ${tag}`,
      review_text: options.review_text ?? `Built by a fixture (${tag})`,
      rating: options.rating ?? 5,
      // HIDDEN BY DEFAULT. reviews.getPublic is a security-critical read and a
      // fixture must not add itself to what the public sees.
      hidden: options.hidden ?? true,
    },
    c
  );
  const user_id = options.user?.id ?? (order as { user_id?: string | null })?.user_id ?? null;
  if (order || user_id) {
    await c.query(
      `UPDATE reviews.reviews SET order_id = $2, user_id = $3 WHERE id = $1`,
      [row.id, order?.id ?? null, user_id]
    );
  }
  return { ...row, order_id: order?.id ?? null, user_id };
}
