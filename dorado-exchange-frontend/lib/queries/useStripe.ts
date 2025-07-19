import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'
import { SpotPrice } from '@/types/metal'
import { User } from '@/types/user'
import { Product } from '@/types/product'
import { PaymentIntent } from '@/types/payment-intent'

export interface IntentParams {
  items: Product[]
  using_funds: boolean
  spots: SpotPrice[]
  user: User
  shipping_service: string
  payment_method: string
  type: string
  address_id: string
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

export const useGetSalesOrderPaymentIntent = (sales_order_id: string) => {
  const { user } = useGetSession()

  return useQuery<PaymentIntent>({
    queryKey: ['admin_pending_payment_intent', user?.id, sales_order_id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<PaymentIntent>(
        'GET',
        '/stripe/get_sales_order_payment_intent',
        undefined,
        {
          sales_order_id: sales_order_id,
        }
      )
    },
    enabled: !!user?.id,
  })
}

export const useCancelPaymentIntent = (sales_order_id: string) => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payment_intent_id: string) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest<string>('POST', '/stripe/cancel_payment_intent', {
        payment_intent_id: payment_intent_id,
      })
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin_pending_payment_intent', user?.id, sales_order_id],
        refetchType: 'active',
      })
    },
  })
}
