"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Review, ReviewPatch } from "@dorado/contracts";

import { apiRequest } from "../fetch";
import { keys } from "../keys";

export function useReviews() {
  return useQuery<Review[]>({
    queryKey: keys.reviews.all(),
    queryFn: () => apiRequest<Review[]>("GET", "/reviews"),
    staleTime: 100_000,
  });
}

export function usePublicReviews() {
  return useQuery<Review[]>({
    queryKey: keys.reviews.public(),
    queryFn: () => apiRequest<Review[]>("GET", "/reviews/public"),
  });
}

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
