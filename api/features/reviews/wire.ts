// The shape the frontend expects, built from table rows.
//
// An identity for reviews: the projection in sql/ is already the intersection
// of reviews.reviews and exchange.reviews, so what comes out of the repo is
// exactly what the old implementation returned. The four columns the new schema
// adds - user_id, order_id, created_by_id, updated_by_id - are excluded there
// rather than here, because a column that never leaves the database cannot be
// forgotten about at the edge.
//
// It stays a real function so the wire shape is decided in exactly one place
// per feature, and callers do not change when it stops being an identity.
import type { ReviewRow } from "#features/reviews/repo.ts";

export type ReviewWire = ReviewRow;

export const toWire = (row: ReviewRow): ReviewWire => row;
export const listToWire = (rows: ReviewRow[]): ReviewWire[] => rows.map(toWire);
