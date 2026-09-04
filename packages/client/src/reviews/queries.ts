"use client";

// THE REVIEWS SURFACE. Admin throughout except `/public`, which is what the
// storefront shows an anonymous visitor - see api/transport/reviews/routes.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Review, ReviewPatch } from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

// GET /api/reviews - admin only. staleTime matches the old hook's explicit
// 100s: the admin list does not need to be instantly fresh on every mount.
export function useReviews() {
  return useQuery<Review[]>({
    queryKey: keys.reviews.all(),
    queryFn: () => apiRequest<Review[]>("GET", "/reviews"),
    staleTime: 100_000,
  });
}

// GET /api/reviews/public - no session at all; feeds the marketing site.
export function usePublicReviews() {
  return useQuery<Review[]>({
    queryKey: keys.reviews.public(),
    queryFn: () => apiRequest<Review[]>("GET", "/reviews/public"),
  });
}

// POST /api/reviews -> 201. Prepended to the cached admin list from the row
// the server actually wrote, the same "feels instant without a refetch"
// shape as leads' create.
export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (review: ReviewPatch) => apiRequest<Review>("POST", "/reviews", review),
    onSuccess: (created) => {
      queryClient.setQueryData<Review[]>(keys.reviews.all(), (previous) =>
        previous ? [created, ...previous] : [created]
      );
    },
  });
}

// PATCH /api/reviews/:id
export function useUpdateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ review_id, patch }: { review_id: string; patch: Partial<ReviewPatch> }) =>
      apiRequest<Review>("PATCH", `/reviews/${review_id}`, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<Review[]>(keys.reviews.all(), (previous) =>
        previous?.map((r) => (r.id === updated.id ? updated : r))
      );
    },
  });
}

// DELETE /api/reviews/:id. Nothing on the frontend calls this today - the
// admin table has no delete action - but the API has the verb (five-verb
// parity), so the hook package offers it too.
export function useDeleteReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (review: Review) => apiRequest<void>("DELETE", `/reviews/${review.id}`),
    onMutate: async (review) => {
      await queryClient.cancelQueries({ queryKey: keys.reviews.all() });
      const previous = queryClient.getQueryData<Review[]>(keys.reviews.all());
      queryClient.setQueryData<Review[]>(keys.reviews.all(), (list) =>
        list?.filter((r) => r.id !== review.id)
      );
      return { previous };
    },
    onError: (_err, _review, context) => {
      if (context?.previous) queryClient.setQueryData(keys.reviews.all(), context.previous);
    },
  });
}
