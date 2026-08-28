import { z } from "zod/v4";
import { ReviewsRow } from "../generated/exchange.js";

// Both the admin and public review endpoints select whole rows, so the wire
// shape is the table shape. Note that `hidden` reaches the public endpoint too.
export const Review = ReviewsRow;
export type Review = z.infer<typeof Review>;

export const CreateReviewBody = ReviewsRow.pick({
  review_text: true,
  rating: true,
  name: true,
});
export type CreateReviewBody = z.infer<typeof CreateReviewBody>;
