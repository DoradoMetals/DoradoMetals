import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'
import { NewReview, Review } from '@/types/reviews'

export const useReview = (review_id: string) => {
  return useQuery<Review[]>({
    queryKey: ['review', review_id],
    queryFn: async () => {
      return await apiRequest<Review[]>('GET', '/reviews/get_one', undefined, {
        review_id: review_id,
      })
    },
    enabled: !!review_id,
  })
}

export const useReviews = () => {
  const { user } = useGetSession()

  return useQuery<Review[]>({
    queryKey: ['reviews', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<Review[]>('GET', '/reviews/get_all', undefined, {})
    },
    enabled: !!user,
    staleTime: 100000
  })
}

export const usePublicReviews = () => {
  return useQuery<Review[]>({
    queryKey: ['reviews'],
    queryFn: async () => {
      return await apiRequest<Review[]>('GET', '/reviews/get_public', undefined, {})
    },
  })
}

export const useCreateReview = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (review: NewReview) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<Review>('POST', '/reviews/create', {
        review,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', user?.id], refetchType: 'active' })
    },
  })
}

export const useUpdateReview = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ review, user_name }: { review: Review; user_name: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<Review>('POST', '/reviews/update', {
        user_name,
        review,
      })
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ['reviews', user?.id] })

      const previous = queryClient.getQueryData<Review[]>(['reviews', user?.id])

      queryClient.setQueryData<Review[]>(['reviews', user?.id], (old = []) =>
        old.map((review) => (review.id === updated?.review.id ? { ...review, ...updated.review } : review))
      )

      return { previous }
    },
    onError: (_err, _newProduct, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['reviews', user?.id], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', user?.id], refetchType: 'active' })
    },
  })
}

export const useDeleteReview = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (review: Review) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('DELETE', '/reviews/delete', {
        review_id: review.id,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', user?.id], refetchType: 'active' })
    },
  })
}
