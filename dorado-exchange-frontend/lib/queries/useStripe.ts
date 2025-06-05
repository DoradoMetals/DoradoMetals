import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'

export const useRetrievePaymentIntent = () => {
  const { user } = useGetSession()

  return useQuery<string>({
    queryKey: ['payment_intent', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<string>('GET', '/stripe/retrieve_payment_intent', undefined, {
        user_id: user.id,
      })
    },
    enabled: !!user?.id,
  })
}

export const useCreatePaymentIntent = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (amount: number) => {
      console.log('here')
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<string>('POST', '/stripe/create_payment_intent', {
        amount: amount,
        user_id: user.id,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['payment_intent', user?.id],
        refetchType: 'active',
      })
    },
  })
}

export const useUpdatePaymentIntent = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ amount, type }: { amount: number; type: string }) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<string>('POST', '/stripe/update_payment_intent', {
        amount: amount,
        type: type,
        user_id: user.id,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['payment_intent', user?.id],
        refetchType: 'active',
      })
    },
  })
}
