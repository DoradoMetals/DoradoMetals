import { AdminSalesOrderCheckout, SalesOrder } from '@/features/orders/salesOrders/types'
import { toAddressSnapshot } from '@/features/orders/salesOrders/users/queries'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

// The admin mutation surface is per-resource under /orders now (D87 final
// form) - the order row via features/orders/patch.ts, the shipment via
// features/shipping/queries.ts. What stays here is the reads and the create.

export const useAdminSalesOrders = () =>
  useApiQuery<SalesOrder[]>({
    key: queryKeys.adminSalesOrders(),
    url: '/orders',
    method: 'GET',
    params: () => ({ direction: 'sale' }),
    requireUser: true,
    refetchInterval: 10000,
    staleTime: 10000,
  })

type AdminCreateSalesOrderVars = {
  paymentIntentId?: string
  sales_order: AdminSalesOrderCheckout
}

export const useAdminCreateSalesOrder = () =>
  useApiMutation<SalesOrder, AdminCreateSalesOrderVars, SalesOrder[]>({
    url: '/sales_orders/admin_create_sales_order',
    method: 'POST',
    requireUser: true,
    queryKey: queryKeys.adminSalesOrders(),
    optimistic: true,
    optimisticItemKey: 'sales_order',
    listAction: 'create',
    listInsertPosition: 'start',
    // The body's address goes down as the snapshot, built at this edge.
    body: ({ paymentIntentId, sales_order }) => ({
      sales_order: {
        ...sales_order,
        address: toAddressSnapshot(sales_order.address, sales_order.user_address),
      },
      payment_intent_id: paymentIntentId,
      spot_prices: sales_order.order_metals,
      user: sales_order.user,
    }),
  })
