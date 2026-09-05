import type { PoolClient } from "pg";
import type { ReviewPatch } from "@dorado/contracts";
import { aTag } from "#shared/testing/builders/ids.ts";
import * as reviews from "#db/reviews/repo.ts";
import type { BuiltOrder } from "#shared/testing/builders/orders.ts";

export async function aReview(
  c: PoolClient,
  order?: BuiltOrder | { id: string; user_id?: string | null } | null,
  patch: Partial<ReviewPatch> = {},
  opts: { user?: { id: string } | null } = {}
) {
  const tag = aTag();
  const row = await reviews.create(
    {
      name: patch.name ?? `Test Reviewer ${tag}`,
      review_text: patch.review_text ?? `Built by a fixture (${tag})`,
      rating: patch.rating ?? 5,
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
