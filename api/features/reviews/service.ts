// Reviews, straight through to the switch.
//
// getPublicReviews is the one an anonymous visitor sees; getAllReviews is
// admin-only and returns hidden ones too. They were one missing clause apart
// once - see the findings register.
import * as reviewsRepo from "#features/reviews/repo.js";
import type { ReviewRow, ReviewInput } from "#features/reviews/repo.next.ts";
import type { QueryResult } from "pg";

export async function getReview(id: string): Promise<ReviewRow | undefined> {
  return await reviewsRepo.getReview(id);
}

export async function getAllReviews(): Promise<ReviewRow[]> {
  return await reviewsRepo.getAllReviews();
}

export async function getPublicReviews(): Promise<ReviewRow[]> {
  return await reviewsRepo.getPublicReviews();
}

export async function createReview(review: ReviewInput): Promise<ReviewRow | undefined> {
  return await reviewsRepo.createReview(review);
}

// Requires the id, matching repo.next.ts. The looser `ReviewInput` would have
// let a caller update nothing in particular, and repo.js is JavaScript so
// nothing downstream would have said so.
export async function updateReview(
  review: ReviewInput & { id: string },
  user_name: string
): Promise<ReviewRow | undefined> {
  return await reviewsRepo.updateReview(review, user_name);
}

export async function deleteReview(id: string): Promise<QueryResult> {
  return reviewsRepo.deleteReview(id);
}
