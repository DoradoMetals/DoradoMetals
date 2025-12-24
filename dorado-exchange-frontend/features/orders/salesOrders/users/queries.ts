import { SalesOrder, SalesOrderCheckout } from '@/types/sales-orders'
import { SpotPrice } from '@/features/spots/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keyFactory'

export const useSalesOrders = () => {
  return useApiQuery<SalesOrder[]>({
    key: queryKeys.salesOrders(),
    url: '/sales_orders/get_sales_orders',
    requireUser: true,
    enabled: (user) => !!user?.id,
    params: (user) => ({
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
    body: (vars, user) => ({
      sales_order: vars.sales_order,
      payment_intent_id: vars.paymentIntentId,
      spot_prices: vars.spotPrices,
      user,
    }),
  })
}

export const useSalesOrderMetals = (sales_order_id: string) => {
  return useApiQuery<SpotPrice[]>({
    key: queryKeys.salesOrderMetals(sales_order_id),
    url: '/sales_orders/get_order_metals',
    method: 'POST',
    requireUser: true,
    enabled: (user) => !!user?.id && !!sales_order_id,
    body: (user) => ({
      user_id: user!.id,
      sales_order_id,
    }),
    refetchInterval: 60_000,
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
