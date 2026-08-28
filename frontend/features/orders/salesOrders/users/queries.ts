import { SalesOrder, SalesOrderCheckout } from '@/features/orders/salesOrders/types'
import { SpotPrice } from '@/features/spots/types'
import { toAddressSnapshot } from '@/features/orders/addressSnapshot'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

// toAddressSnapshot moved to features/orders/addressSnapshot.ts - one copy
// for both directions and the cancel op, which had three.
export { toAddressSnapshot }

export const useSalesOrders = () => {
  return useApiQuery<SalesOrder[]>({
    key: queryKeys.salesOrders(),
    url: '/orders',
    requireUser: true,
    enabled: (user) => !!user?.id,
    // Self-scoped even for an admin caller - see usePurchaseOrders.
    params: (user) => ({
      direction: 'sale',
      user_id: user!.id,
    }),
    refetchInterval: 10_000,
  })
}

export const useCreateSalesOrder = () => {
  return useApiMutation<
    SalesOrder,
    {
      paymentIntentId?: string
      sales_order: SalesOrderCheckout
      spotPrices: SpotPrice[]
    },
    SalesOrder[]
  >({
    queryKey: queryKeys.salesOrders(),
    url: '/sales_orders/create_sales_order',
    method: 'POST',
    requireUser: true,
    optimistic: false,
    // The body's address goes down as the snapshot, built at this edge.
    body: (vars, user) => ({
      sales_order: {
        ...vars.sales_order,
        address: toAddressSnapshot(vars.sales_order.address, vars.sales_order.user_address),
      },
      payment_intent_id: vars.paymentIntentId,
      spot_prices: vars.spotPrices,
      user,
    }),
  })
}

export const useSetReviewCreated = () => {
  return useApiMutation<SalesOrder, { sales_order: SalesOrder }, SalesOrder[]>({
    queryKey: queryKeys.salesOrders(),
    url: '/sales_orders/create_review',
    method: 'POST',
    requireUser: true,
    listAction: 'upsert',
    optimisticUpdater: (list, { sales_order }) => {
      const orders = list ?? []
      return orders.map((order) =>
        order.id !== sales_order.id ? order : { ...order, review_created: true }
      )
    },
    body: (vars, user) => ({
      user_id: user!.id,
      order: vars.sales_order,
    }),
  })
}
