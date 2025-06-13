import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'
import { SpotPrice } from '@/types/metal'
import { User } from '@/types/user'
import { Product } from '@/types/product'

export interface IntentParams {
  items: Product[]
  using_funds: boolean
  spots: SpotPrice[]
  user: User
  shipping_service: string
  payment_method: string
  type: string
}

export const useRetrievePaymentIntent = (type: string) => {
  const { user } = useGetSession()

  return useQuery<string>({
    queryKey: ['payment_intent', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<string>('GET', '/stripe/retrieve_payment_intent', undefined, {
        type: type,
      })
    },
    enabled: !!user?.id,
  })
}

export const useUpdatePaymentIntent = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: IntentParams) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<string>('POST', '/stripe/update_payment_intent', params)
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['payment_intent', user?.id],
        refetchType: 'active',
      })
    },
  })
}
