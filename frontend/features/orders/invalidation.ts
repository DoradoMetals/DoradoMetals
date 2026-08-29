import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { queryKeys } from '@/shared/queries/keys'
import type { PurchaseOrder } from '@/features/orders/purchaseOrders/types'
import type { SalesOrder } from '@/features/orders/salesOrders/types'

// THE ONE CACHE POLICY for order-touching mutations (D87, per-resource form).
// Every hook that writes an order, one of its resources (items, spots,
// shipment, payout), or its refiner data settles through
// invalidateOrderReads, and every non-price optimistic write to the order
// lists goes through the helpers below - so what refetches and what flips
// optimistically each live in exactly one place.

// Both directions' lists (prefix - the concrete keys carry the user), the
// order's metals caches, and the orderQuotes prefix, which covers the profit
// breakdown keyed under it on purpose. Deliberately broad: refetchType
// 'active' bounds the cost to what is mounted, and a policy with no
// per-resource carve-outs cannot go stale when a field moves resources.
export const invalidateOrderReads = (queryClient: QueryClient, order_id?: string) => {
  const keys: QueryKey[] = [
    ['purchase_orders'],
    ['admin_purchase_orders'],
    queryKeys.adminSalesOrders(),
    queryKeys.salesOrders(),
    ...(order_id
      ? ([
          // THE ORDER-SCOPED READ FAMILY (wave 3). The order document no
          // longer carries items, shipments, the payout or the address, so
          // each of their reads is invalidated by name: a mutation that once
          // refetched one composed blob now refetches the resources it
          // touched. Broad on purpose, same as the lists - refetchType
          // 'active' bounds the cost to what is mounted.
          ['order_items', order_id],
          ['order_address', order_id],
          ['order_shipments', order_id],
          ['order_payouts', order_id],
          ['order_pickups', order_id],
          ['order_directs', order_id],
          ['order_spots', order_id],
          ['refiner_metals', order_id],
          ['refiner_items', order_id],
          ['refiner_order', order_id],
          // The fulfillment read (features/fulfillments/queries.ts) serves the
          // same rows the shipment mutations write.
          ['order_fulfillment', order_id],
        ] as QueryKey[])
      : []),
    queryKeys.orderQuotes(),
  ]
  for (const queryKey of keys) {
    queryClient.invalidateQueries({ queryKey, refetchType: 'active' })
  }
}

type OrderListSnapshot = [QueryKey, readonly unknown[] | undefined][]

// Map one purchase order across both lists (user and admin), returning the
// snapshot onError hands back to rollbackOrderLists. D83's rule holds for
// every caller: only NON-price fields go through here - status flips, the
// spots_locked flag, confirmed flags, line removal. Prices refetch.
export const optimisticallyUpdatePurchaseOrder = async (
  queryClient: QueryClient,
  user: { id?: string } | null | undefined,
  order_id: string,
  map: (order: PurchaseOrder) => PurchaseOrder
): Promise<OrderListSnapshot> => {
  const listKeys: QueryKey[] = [
    ['purchase_orders', user?.id],
    ['admin_purchase_orders', user],
  ]

  const previous: OrderListSnapshot = []
  for (const queryKey of listKeys) {
    await queryClient.cancelQueries({ queryKey })
    previous.push([queryKey, queryClient.getQueryData<PurchaseOrder[]>(queryKey)])
    queryClient.setQueryData<PurchaseOrder[]>(queryKey, (old = []) =>
      old.map((order) => (order.id === order_id ? map(order) : order))
    )
  }
  return previous
}

// The sales twin: both sales lists carry no user in their keys.
export const optimisticallyUpdateSalesOrder = async (
  queryClient: QueryClient,
  order_id: string,
  map: (order: SalesOrder) => SalesOrder
): Promise<OrderListSnapshot> => {
  const listKeys: QueryKey[] = [queryKeys.adminSalesOrders(), queryKeys.salesOrders()]

  const previous: OrderListSnapshot = []
  for (const queryKey of listKeys) {
    await queryClient.cancelQueries({ queryKey })
    previous.push([queryKey, queryClient.getQueryData<SalesOrder[]>(queryKey)])
    queryClient.setQueryData<SalesOrder[]>(queryKey, (old = []) =>
      old.map((order) => (order.id === order_id ? map(order) : order))
    )
  }
  return previous
}

export const rollbackOrderLists = (queryClient: QueryClient, previous?: OrderListSnapshot) => {
  for (const [queryKey, orders] of previous ?? []) {
    if (orders) queryClient.setQueryData(queryKey, orders)
  }
}

// The order's LINES, optimistically (wave 3). They are their own query now -
// ['order_items', order_id] - so a confirmed flag or a removal flips there
// rather than inside a composed order in two list caches. D83's rule is
// unchanged and easier to keep here: only NON-price fields go through this;
// every scrap and bullion figure prices the line and comes back from the
// refetch invalidateOrderReads schedules.
export const optimisticallyUpdateOrderItems = async (
  queryClient: QueryClient,
  order_id: string,
  map: (items: readonly unknown[]) => unknown[]
): Promise<OrderListSnapshot> => {
  const queryKey: QueryKey = ['order_items', order_id]
  await queryClient.cancelQueries({ queryKey })
  const previous: OrderListSnapshot = [[queryKey, queryClient.getQueryData<unknown[]>(queryKey)]]
  queryClient.setQueryData<unknown[]>(queryKey, (old = []) => map(old))
  return previous
}
