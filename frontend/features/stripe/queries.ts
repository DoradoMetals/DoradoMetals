import { SpotPrice } from '@/features/spots/types'
import { AdminUser, User } from '@/features/users/types'
import { Product } from '@/features/products/types'
import { PaymentIntent } from '@/features/stripe/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

interface IntentParams {
  items: Product[]
  using_funds: boolean
  spots: SpotPrice[]
  // BOTH THINGS THIS TREE CALLS A USER REALLY ARE PASSED HERE, and the union
  // says so rather than one of them standing in for the other. The customer
  // checkout sends better-auth's session user; the admin create-sales-order
  // drawer sends an `AdminUser` off GET /users/get_all, because on that path
  // this is THE CUSTOMER and not the caller.
  //
  // Safe because the server reads exactly two fields off it -
  // api/features/payments/service.ts types its own parameter
  // `{ id?: string; dorado_funds?: number | null }` and prices the order
  // against `dorado_funds` - and both shapes carry both.
  user: User | AdminUser
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
