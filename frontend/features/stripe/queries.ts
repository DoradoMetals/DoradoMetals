import type { CheckoutLine } from '@/features/checkout/items/types'
import { PaymentIntent } from '@/features/stripe/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'
import { usePaymentMethods } from '@/features/payments/queries'
import { useSaleShippingServices } from '@/features/shipping/queries'

// THE PRICING UPDATE IS IDS NOW (D214 item 11, ruling 43; the contracts'
// UpdatePaymentIntentBody). Every field the browser used to compose is a row
// the server already holds:
//
//   items[]            still the basket, reduced to {id, quantity} here - a
//                      strict object, not a whole catalogue product.
//   using_funds/spots  GONE. `spots` was declared-and-ignored; `using_funds`
//                      is a BEHAVIOUR CHANGE - credit applies whenever the
//                      customer has a balance, same as placement (flagged in
//                      docs/waves/streamline-a-shape-changes.md §1).
//   user               GONE. It carried `dorado_funds`, so the request
//                      declared the balance it priced against. `user_id` is
//                      ADMIN ONLY now - a customer's own intent is keyed by
//                      their session and this field stays undefined.
//   shipping_service   -> carrier_service_id, resolved here against the same
//                      cached shipping.services rows useCreateSalesOrder
//                      resolves a checkout row's id against.
//   payment_method     -> payment_method_id, resolved against payments.methods
//                      the same way.
interface IntentParams {
  items: CheckoutLine[]
  shipping_service: string
  payment_method: string
  type: string
  address_id: string
  // ADMIN ONLY: which customer this intent prices for.
  user_id?: string
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
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const { data: saleServices = [] } = useSaleShippingServices()

  return useApiMutation<string, IntentParams, unknown>({
    queryKey: queryKeys.paymentIntent(),
    url: '/stripe/update_payment_intent',
    requireUser: true,
    optimistic: false,
    body: (params) => ({
      items: params.items.flatMap((i) =>
        i.bullion_id ? [{ id: i.bullion_id, quantity: i.quantity ?? 1 }] : []
      ),
      address_id: params.address_id || undefined,
      carrier_service_id: saleServices.find((s) => s.code === params.shipping_service)?.id,
      payment_method_id: saleMethods.find((m) => m.type === params.payment_method)?.id,
      ...(params.user_id ? { user_id: params.user_id } : {}),
      type: params.type,
    }),
  })
}

// Named for the admin sales-order screen this serves, not for a two-column
// vocabulary - orders.orders is one table with a direction, and the id this
// takes is just the order's own.
export const useGetSalesOrderPaymentIntent = (order_id: string) => {
  return useApiQuery<PaymentIntent>({
    key: queryKeys.adminPaymentIntent(order_id),
    url: '/stripe/get_sales_order_payment_intent',
    method: 'GET',
    requireAdmin: true,
    enabled: (user) => !!user?.id && !!order_id,
    params: () => ({
      order_id,
    }),
  })
}

export const useCancelPaymentIntent = (order_id: string) => {
  return useApiMutation<string, string, PaymentIntent[]>({
    queryKey: queryKeys.adminPaymentIntent(order_id),
    url: '/stripe/cancel_payment_intent',
    requireAdmin: true,
    optimistic: false,
    body: (payment_intent_id) => ({
      payment_intent_id,
    }),
  })
}
