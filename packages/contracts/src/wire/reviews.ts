import { z } from "zod/v4";
import { ReviewsRow } from "../generated/reviews.js";

// SOURCED FROM THE LIVE `reviews` SCHEMA, NOT `exchange`. This used to import
// exchange's ReviewsRow, whose `hidden` is `z.boolean().nullable()` -
// reviews.reviews' own `hidden` is NOT NULL (create.sql's COALESCE supplies
// the default at write time, and the column never holds null after). A body
// contract built on the stale schema advertised a clear the live table
// refuses; the fix is pointing at the schema this feature actually reads and
// writes, not re-widening the type by hand.
//
// Both the admin and public review endpoints select whole rows, so the wire
// shape is the table shape. Note that `hidden` reaches the public endpoint too.
export const Review = ReviewsRow;
export type Review = z.infer<typeof Review>;

// POST /reviews/create. THE FOUR COLUMNS THE SERVICE ACTUALLY WRITES -
// api/db/reviews/repo.ts's own `NewReview` is
// Partial<Pick<ReviewRow, "name" | "review_text" | "rating" | "hidden">>.
// `created_by`/`updated_by` are NOT fields here (item 4): public.audit_stamp
// writes both from the connection's actor, and neither was ever a column
// `create()` accepted - carrying them in the old contract just meant a
// caller's claimed author was silently discarded rather than refused.
export const CreateReviewBody = ReviewsRow.pick({
  review_text: true,
  rating: true,
  name: true,
  hidden: true,
}).partial();
export type CreateReviewBody = z.infer<typeof CreateReviewBody>;

// PATCH - the same four columns, repo.ts's own PATCHABLE.
export const ReviewPatch = CreateReviewBody;
export type ReviewPatch = z.infer<typeof ReviewPatch>;
