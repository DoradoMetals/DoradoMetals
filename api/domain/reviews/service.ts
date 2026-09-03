// Reviews: orchestration and the wire shape.
//
// getPublic is the one an anonymous visitor sees and list is admin-only.
// They are separate all the way down - separate service functions, separate
// repo functions, separate statements - because they were one missing clause
// apart once, on a route with no guard in front of it.
//
// update TAKES AN ID AND A PATCH, never a round-tripped row. The repo answers
// whether a row changed; this refetches so the response still carries the
// fresh state the caller expects.
import withTransaction from "#shared/db/withTransaction.ts";
import * as reviews from "#db/reviews/repo.ts";
import type { ReviewRow, NewReview, ReviewPatch } from "#db/reviews/repo.ts";

// The wire IS the row - the identity adapter died with D212.
export type ReviewWire = ReviewRow;

interface HttpError extends Error { statusCode?: number }

const notFound = (id: string): HttpError => {
  const err: HttpError = new Error(`no review ${id}`);
  err.statusCode = 404;
  return err;
};

export async function getOne(id: string): Promise<ReviewWire> {
  const row = await reviews.getOne(id);
  if (!row) throw notFound(id);
  return row;
}

export async function list(): Promise<ReviewWire[]> {
  return await reviews.list();
}

export async function getPublic(): Promise<ReviewWire[]> {
  return await reviews.getPublic();
}

export async function create(review: NewReview): Promise<ReviewWire> {
  return withTransaction(async (client) => {
    return await reviews.create(review, client);
  });
}

export async function update(id: string, patch: ReviewPatch): Promise<ReviewWire> {
  return withTransaction(async (client) => {
    const changed = await reviews.update(id, patch, client);
    if (!changed) throw notFound(id);
    const row = await reviews.getOne(id, client);
    if (!row) throw notFound(id);
    return row;
  });
}

export async function remove(id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    return await reviews.remove(id, client);
  });
}
