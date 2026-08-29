// Reviews, FROM THE CONTRACTS (phase 3, ruling 39: a shape describing a row
// is data wherever it happens to sit).
//
// This file hand-wrote `Review` as nine required fields. Every one of them
// except `id` is NULLABLE in exchange.reviews, and `created_at`/`updated_at`
// were typed `Date` against a wire that sends strings - the same three
// disagreements the media conversion found, checked against nothing. The
// components already null-guard most of them (`review.review_text ?? ''`,
// `Number(r.rating) || 0`), which is what a hand-written type being wrong
// looks like from the inside: the code knows, the declaration does not.
import type { Review as ReviewContract, CreateReviewBody } from '@dorado/contracts'

export type Review = ReviewContract

// The create body is the SIX columns the API's statement writes - see the
// contract for why `hidden` is load-bearing and must not be trimmed off.
export type NewReview = CreateReviewBody

// The update mutation's variable bundle: the row plus who is editing it.
// react-query plumbing, not a wire shape - the body it builds is
// { user_name, review }.
export type UpdateReviewVars = {
  review: Review
  user_name: string
}
