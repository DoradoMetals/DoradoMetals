import { SalesOrder, SalesOrderCheckout } from '@/features/orders/salesOrders/types'
import { SpotPrice } from '@/features/spots/types'
import type { OrderAddressSnapshot, SpotOnOrder } from '@dorado/contracts'
import type { Address, UserAddress } from '@/features/addresses/types'
import { apiRequest } from '@/shared/queries/axios'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

// The order's address on the wire is a SNAPSHOT built at the mutation edge
// from the checkout's picked pair - see the note in purchaseOrders/users/
// queries.ts, the same build.
export const toAddressSnapshot = (a: Address, ua?: UserAddress | null): OrderAddressSnapshot => ({
  address_id: a.id ?? null,
  recipient_name: ua?.label ?? null,
  line_1: a.line_1,
  line_2: a.line_2,
  city: a.city,
  state: a.state,
  country: a.country,
  country_code: a.country_code,
  zip: a.zip,
  phone_number: a.phone_number,
  is_residential: a.is_residential,
  is_valid: a.is_valid,
})

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
