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
import type {
  Review as ReviewContract,
  CreateReviewBody,
  ReviewPatch as ReviewPatchContract,
} from '@dorado/contracts'

export type Review = ReviewContract

// The create body is the SIX columns the API's statement writes - see the
// contract for why `hidden` is load-bearing and must not be trimmed off.
export type NewReview = CreateReviewBody

// The update body's `patch`: the same four columns reviews.update() writes
// (api/db/reviews/repo.ts PATCHABLE), now the contract's own export.
// created_at/updated_at are stamped by the audit trigger now and are no
// longer patchable at all.
export type ReviewPatch = ReviewPatchContract

// The update mutation's variable bundle: the id and the patch. react-query
// plumbing, not a wire shape - the body it builds is { review_id, patch }.
export type UpdateReviewVars = {
  review_id: string
  patch: ReviewPatch
}
