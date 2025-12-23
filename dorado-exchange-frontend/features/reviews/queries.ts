import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keyFactory'
import { NewReview, Review, UpdateReviewVars } from '@/features/reviews/types'

export const useReview = (reviewId: string | null) => {
  return useApiQuery<Review[]>({
    key: queryKeys.review(reviewId ?? ''),
    url: '/reviews/get_one',
    params: () => (reviewId ? { review_id: reviewId } : undefined),
    enabled: !!reviewId,
  })
}

export const useReviews = () => {
  return useApiQuery<Review[]>({
    key: queryKeys.reviews(),
    url: '/reviews/get_all',
    requireAdmin: true,
    enabled: (user) => !!user?.id,
    staleTime: 100_000,
  })
}

export const usePublicReviews = () => {
  return useApiQuery<Review[]>({
    key: queryKeys.publicReviews(),
    url: '/reviews/get_public',
    requireUser: false,
  })
}

export const useCreateReview = () => {
  return useApiMutation<Review, NewReview, Review[]>({
    queryKey: queryKeys.reviews(),
    url: '/reviews/create',
    requireAdmin: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: (review) => ({ review }),
  })
}

export const useUpdateReview = () => {
  return useApiMutation<Review, UpdateReviewVars, Review[]>({
    queryKey: queryKeys.reviews(),
    url: '/reviews/update',
    requireAdmin: true,
    listAction: 'upsert',
    optimisticItemKey: 'review',
    body: (vars) => ({
      user_name: vars.user_name,
      review: vars.review,
    }),
  })
}

export const useDeleteReview = () => {
  return useApiMutation<unknown, Review, Review[]>({
    queryKey: queryKeys.reviews(),
    method: 'DELETE',
    url: '/reviews/delete',
    requireAdmin: true,
    listAction: 'delete',
    body: (review) => ({
      review_id: review.id,
    }),
  })
}
