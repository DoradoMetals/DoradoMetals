// Dual-write phase of the reviews schema migration.
//
// Writes go to exchange and are mirrored verbatim into the new schema, both in one
// transaction. Reads come from the new schema, so the new schema is exercised by real
// traffic while exchange stays a complete replica that can still be fallen back
// to without losing anything.
//
// See api/features/leads/repo.dual.ts for the reasoning; this is the same
// pattern in the feature's own idiom.
import withTransaction from "#shared/db/withTransaction.js";
import * as exchange from "#features/reviews/repo.exchange.js";
import * as next from "#features/reviews/repo.next.js";
import { mirrorReview } from "#features/reviews/repo.next.js";

export const getReview = next.getReview;
export const getAllReviews = next.getAllReviews;
export const getPublicReviews = next.getPublicReviews;

// Join the caller's transaction if there is one, so the pair of writes stays
// atomic with whatever else it is doing.
const both = (executor, fn) => (executor ? fn(executor) : withTransaction(fn));

export async function createReview(review, executor) {
  return both(executor, async (c) => {
    const written = await exchange.createReview(review, c);
    await mirrorReview(written.id, c);
    return written;
  });
}

export async function updateReview(review, user_name, executor) {
  return both(executor, async (c) => {
    const written = await exchange.updateReview(review, user_name, c);
    await mirrorReview(written.id, c);
    return written;
  });
}

export async function deleteReview(id, executor) {
  return both(executor, async (c) => {
    const result = await exchange.deleteReview(id, c);
    await next.deleteReview(id, c);
    return result;
  });
}
