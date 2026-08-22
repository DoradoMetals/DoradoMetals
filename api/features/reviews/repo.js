// Selects which schema the reviews feature reads and writes.
// Same three-phase pattern as leads - see api/features/leads/repo.js.
//
//   REVIEWS_SOURCE=exchange   (default) read exchange, write exchange
//   REVIEWS_SOURCE=dual                 read core,     write BOTH
//
// There is deliberately no `next`. Writing only to the new schema is the
// one-way door - exchange stops receiving writes and flipping back drops
// everything written in between - and CLAUDE.md says to go through dual and
// stay there. Adding it back should be a deliberate, separate change.
//   REVIEWS_SOURCE=core                 read core,     write core
//
// Go through dual and stay there. It is the only reversible setting.
// Gate on `pnpm --filter @dorado/api diff reviews` before promoting.
import * as exchange from "#features/reviews/repo.exchange.js";
import * as dual from "#features/reviews/repo.dual.js";

const SOURCES = { exchange, dual };

const SOURCE = Object.hasOwn(SOURCES, process.env.REVIEWS_SOURCE ?? "")
  ? process.env.REVIEWS_SOURCE
  : "exchange";

const impl = SOURCES[SOURCE];

export const activeSource = SOURCE;

export const getReview = impl.getReview;
export const getAllReviews = impl.getAllReviews;
export const getPublicReviews = impl.getPublicReviews;
export const createReview = impl.createReview;
export const updateReview = impl.updateReview;
export const deleteReview = impl.deleteReview;
