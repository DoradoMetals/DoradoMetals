// Reviews - the hooks now live in @dorado/client; this file re-exports them
// under the same names so ReviewsAdminTable.tsx, ReviewsDrawer.tsx and
// ReviewsLandingSection.tsx need no changes. `useDeleteReview` is new (the
// API has the verb; nothing on the frontend calls it yet, but it is exported
// for parity with the other four).
export {
  useReviews, usePublicReviews, useCreateReview, useUpdateReview, useDeleteReview,
} from "@dorado/client";
