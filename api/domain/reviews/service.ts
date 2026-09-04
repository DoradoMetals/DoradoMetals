// Reviews: orchestration and the wire shape.
//
// getPublic (anonymous) and list (admin-only) are separate all the way down - separate service functions, repo functions, statements: security-critical, not a flag.
// update takes an id and a patch, never a round-tripped row; the repo answers the written row itself (RETURNING), so no re-read can find nothing.
import withTransaction from "#shared/db/withTransaction.ts";
import * as reviews from "#db/reviews/repo.ts";
import * as rules from "#domain/reviews/rules.ts";
import type { Review, ReviewPatch } from "@dorado/contracts";

export async function getOne(id: string): Promise<Review> {
  const row = await reviews.getOne(id);
  rules.assertReview(row, id);
  return row;
}

export async function list(): Promise<Review[]> {
  return await reviews.list();
}

export async function getPublic(): Promise<Review[]> {
  return await reviews.getPublic();
}

export async function create(review: ReviewPatch): Promise<Review> {
  return withTransaction(async (client) => {
    return await reviews.create(review, client);
  });
}

export async function update(id: string, patch: ReviewPatch): Promise<Review> {
  return withTransaction(async (client) => {
    const row = await reviews.update(id, patch, client);
    rules.assertReview(row, id);
    return row;
  });
}

export async function remove(id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    return await reviews.remove(id, client);
  });
}
