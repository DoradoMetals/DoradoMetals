// aReview - a customer review.
//
// THE ORDER AND THE AUTHOR ARE COLUMNS THE REPO DOES NOT WRITE. `create` takes
// name/text/rating/hidden only, because a review arrives from a form; user_id
// and order_id are set by whatever links it to an order. A builder that wants
// a review OF an order therefore writes them afterwards, and does so through
// the same client so the row stays inside the caller's transaction.
//
// `user` is NOT a table column - it is how a caller says whose review this is,
// and it is not accepted through the patch (which is exactly the columns
// reviews.reviews lets a create/update touch): it is its own parameter, so
// the patch type can stay the contract's own shape.
import type { PoolClient } from "pg";
import type { ReviewPatch } from "@dorado/contracts";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as reviews from "#db/reviews/repo.ts";
import type { BuiltOrder } from "#shared/testing/builders/orders.ts";

export async function aReview(
  c: PoolClient,
  order?: BuiltOrder | { id: string; user_id?: string | null } | null,
  patch: Partial<ReviewPatch> & { id?: string } = {},
  opts: { user?: { id: string } | null } = {}
) {
  const tag = aTag();
  const row = await reviews.create(
    {
      id: patch.id ?? anId(),
      name: patch.name ?? `Test Reviewer ${tag}`,
      review_text: patch.review_text ?? `Built by a fixture (${tag})`,
      rating: patch.rating ?? 5,
      // HIDDEN BY DEFAULT. reviews.getPublic is a security-critical read and a
      // fixture must not add itself to what the public sees.
      hidden: patch.hidden ?? true,
    },
    c
  );
  const user_id = opts.user?.id ?? (order as { user_id?: string | null })?.user_id ?? null;
  if (order || user_id) {
    await c.query(
      `UPDATE reviews.reviews SET order_id = $2, user_id = $3 WHERE id = $1`,
      [row.id, order?.id ?? null, user_id]
    );
  }
  return { ...row, order_id: order?.id ?? null, user_id };
}
