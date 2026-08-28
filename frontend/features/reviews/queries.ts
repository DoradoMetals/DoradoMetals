import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import { NewReview, Review, UpdateReviewVars } from '@/features/reviews/types'

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

