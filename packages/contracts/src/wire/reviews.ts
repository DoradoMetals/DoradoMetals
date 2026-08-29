import { z } from "zod/v4";
import { ReviewsRow } from "../generated/exchange.js";

// Both the admin and public review endpoints select whole rows, so the wire
// shape is the table shape. Note that `hidden` reaches the public endpoint too.
export const Review = ReviewsRow;
export type Review = z.infer<typeof Review>;

// POST /reviews/create. THE SIX COLUMNS THE SERVICE ACTUALLY WRITES -
// api/features/reviews/repo.ts types its own argument as
// Pick<ReviewRow, "review_text" | "rating" | "created_by" | "updated_by" |
// "name" | "hidden">, and create.sql inserts exactly those.
//
// IT WAS THREE UNTIL PHASE 3, and that was a narrowing nobody had noticed
// because nothing imported this shape: `created_by`, `updated_by` and
// `hidden` were missing. `hidden` is not a bookkeeping column - it is the
// entire difference between get_all and get_public, and the admin table
// creates with `hidden: true` so a review it seeds is not published by the
// act of creating it. A frontend narrowed onto the three-field version
// would have stopped sending it, and `r.hidden ?? false` in the repo would
// have published every admin-created review. That is why an input contract
// is derived from what the statement writes rather than from what looks
// tidy (ruling 37's note, D145's class).
export const CreateReviewBody = ReviewsRow.pick({
  review_text: true,
  rating: true,
  name: true,
  created_by: true,
  updated_by: true,
  hidden: true,
});
export type CreateReviewBody = z.infer<typeof CreateReviewBody>;
