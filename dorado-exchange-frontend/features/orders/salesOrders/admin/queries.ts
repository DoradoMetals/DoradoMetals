import { AdminSalesOrderCheckout, SalesOrder } from '@/features/orders/salesOrders/types'
import { SpotPrice } from '@/features/spots/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

export const useAdminSalesOrders = () =>
  useApiQuery<SalesOrder[]>({
    key: queryKeys.adminSalesOrders(),
    url: '/sales_orders/get_all',
    method: 'GET',
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
    body: ({ paymentIntentId, sales_order }) => ({
      sales_order,
      payment_intent_id: paymentIntentId,
      spot_prices: sales_order.order_metals,
      user: sales_order.user,
    }),
  })

type MoveSalesOrderStatusVars = {
  order_status: string
  order: SalesOrder
}

export const useMoveSalesOrderStatus = () =>
  useApiMutation<void, MoveSalesOrderStatusVars, SalesOrder[]>({
    url: '/sales_orders/update_status',
    method: 'POST',
    requireUser: true,
    requireAdmin: true,
    queryKey: queryKeys.adminSalesOrders(),
    optimistic: true,
    optimisticItemKey: 'order',
    body: ({ order_status, order }, user) => ({
      order_status,
      order,
      user_name: user?.name,
    }),
  })

type SendOrderToSupplierVars = {
  order: SalesOrder
  spots: SpotPrice[]
  supplier_id: string
}

export const useSendOrderToSupplier = () =>
  useApiMutation<void, SendOrderToSupplierVars, SalesOrder[]>({
    url: '/sales_orders/send_order_to_supplier',
    method: 'POST',
    requireUser: true,
    requireAdmin: true,
    queryKey: queryKeys.adminSalesOrders(),
    optimistic: true,
    body: ({ order, spots, supplier_id }) => ({
      order,
      spots,
      supplier_id,
    }),
    optimisticUpdater: (list, { order, supplier_id }) =>
      (list ?? []).map((o) =>
        o.id !== order.id
          ? o
          : {
              ...o,
              order_sent: true,
              supplier_id,
            }
      ),
  })

type UpdateTrackingVars = {
  order_id: string
  shipment_id: string
  tracking_number: string
  carrier_id: string
}

export const useUpdateTracking = () =>
  useApiMutation<void, UpdateTrackingVars, SalesOrder[]>({
    url: '/sales_orders/update_tracking',
    method: 'POST',
    requireUser: true,
    requireAdmin: true,
    queryKey: queryKeys.adminSalesOrders(),
    optimistic: true,
    body: (vars) => vars,
    optimisticUpdater: (list, { order_id, tracking_number, carrier_id }) =>
      (list ?? []).map((order) =>
        order.id !== order_id
          ? order
          : {
              ...order,
              shipment: {
                ...(order.shipment ?? {}),
                tracking_number,
                carrier_id,
              },
            }
      ),
  })
