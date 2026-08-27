// Reviews: orchestration, transactions, and the dual write.
//
// Reads come from reviews.reviews; writes go to both schemas in one
// transaction under an id generated here, so both rows share a primary key by
// construction. Removing exchange later is a change to this file rather than to
// every repo under it.
//
// getPublic is the one an anonymous visitor sees and getAll is admin-only.
// They are separate all the way down - separate service functions, separate
// repo functions, separate statements - because they were one missing clause
// apart once, on a route with no guard in front of it.
import { randomUUID } from "node:crypto";
import withTransaction from "#shared/db/withTransaction.js";
import * as reviews from "#features/reviews/repo.ts";
import * as legacy from "#features/reviews/legacy.repo.ts";
import { toWire, listToWire, type ReviewWire } from "#features/reviews/wire.ts";
import type { ReviewInput } from "#features/reviews/repo.ts";

interface HttpError extends Error { statusCode?: number }

const notFound = (id: string): HttpError => {
  const err: HttpError = new Error(`no review ${id}`);
  err.statusCode = 404;
  return err;
};

export async function getOne(id: string): Promise<ReviewWire> {
  const row = await reviews.getOne(id);
  if (!row) throw notFound(id);
  return toWire(row);
}

export async function getAll(): Promise<ReviewWire[]> {
  return listToWire(await reviews.getAll());
}

export async function getPublic(): Promise<ReviewWire[]> {
  return listToWire(await reviews.getPublic());
}

export async function create(review: ReviewInput): Promise<ReviewWire> {
  const id = randomUUID();
  return withTransaction(async (client) => {
    await legacy.create(id, review, client);
    return toWire(await reviews.create(id, review, client));
  });
}

export async function update(
  review: ReviewInput & { id: string },
  user_name: string
): Promise<ReviewWire> {
  return withTransaction(async (client) => {
    await legacy.update(review, user_name, client);
    const row = await reviews.update(review, user_name, client);
    if (!row) throw notFound(review.id);
    return toWire(row);
  });
}

export async function remove(id: string): Promise<number> {
  return withTransaction(async (client) => {
    await legacy.remove(id, client);
    return await reviews.remove(id, client);
  });
}
