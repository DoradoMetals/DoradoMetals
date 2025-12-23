import { SpotPrice } from '@/features/spots/types'
import { User } from '@/types/user'
import { Product } from '@/features/products/types'
import { PaymentIntent } from '@/types/payment-intent'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keyFactory'

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

export const useRetrievePaymentIntent = (type: string, userId?: string) => {
  return useApiQuery<string>({
    key: queryKeys.paymentIntent(),
    url: '/stripe/retrieve_payment_intent',
    requireUser: true,
    enabled: (user) => !!user?.id,
    params: (user) => ({
      type,
      user_id: userId ?? user?.id,
    }),
  })
}

export const useUpdatePaymentIntent = () => {
  return useApiMutation<string, IntentParams, unknown>({
    queryKey: queryKeys.paymentIntent(),
    url: '/stripe/update_payment_intent',
    requireUser: true,
    optimistic: false,
    body: (params) => params,
  })
}

export const useGetSalesOrderPaymentIntent = (sales_order_id: string) => {
  return useApiQuery<PaymentIntent>({
    key: queryKeys.adminPaymentIntent(sales_order_id),
    url: '/stripe/get_sales_order_payment_intent',
    method: 'GET',
    requireAdmin: true,
    enabled: (user) => !!user?.id && !!sales_order_id,
    params: () => ({
      sales_order_id,
    }),
  })
}

export const useCancelPaymentIntent = (sales_order_id: string) => {
  return useApiMutation<string, string, PaymentIntent[]>({
    queryKey: queryKeys.adminPaymentIntent(sales_order_id),
    url: '/stripe/cancel_payment_intent',
    requireAdmin: true,
    optimistic: false,
    body: (payment_intent_id) => ({
      payment_intent_id,
    }),
  })
}
