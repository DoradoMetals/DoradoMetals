'use client'

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  AdminOrderCreate,
  OrderCancelBody,
  OrderCreateBody,
  OrderItem,
  OrderItemPatch,
  OrderPatch,
  OrderSpotsPutBody,
  OrderView,
} from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

function absorb(client: QueryClient, view: OrderView): OrderView {
  client.setQueryData(keys.orders.view(view.order.id), view)
  client.invalidateQueries({ queryKey: keys.orders.all(), refetchType: 'active' })
  return view
}

export function invalidateOrder(client: QueryClient, order_id: string): void {
  client.invalidateQueries({ queryKey: keys.orders.scoped(order_id), refetchType: 'active' })
  client.invalidateQueries({ queryKey: keys.orders.all(), refetchType: 'active' })
}

export function useCreateOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (body: OrderCreateBody) =>
      await apiRequest<OrderView>('POST', '/orders', body),
    onSuccess: (view) => absorb(client, view),
  })
}

export function useAdminCreateOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (body: AdminOrderCreate) =>
      await apiRequest<OrderView>('POST', '/orders/admin', body),
    onSuccess: (view) => absorb(client, view),
  })
}

export function usePatchOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: OrderPatch }) =>
      await apiRequest<OrderView>('PATCH', `/orders/${id}`, patch),
    onSuccess: (view) => absorb(client, view),
  })
}

export function useCreateOrderReview() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      await apiRequest<OrderView>('POST', `/orders/${id}/review`),
    onSuccess: (view) => absorb(client, view),
  })
}

export function useFinalizePricing() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      await apiRequest<OrderView>('POST', `/orders/${id}/finalize_pricing`),
    onSuccess: (view) => absorb(client, view),
  })
}

export function useAddFunds() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      await apiRequest<OrderView>('POST', `/orders/${id}/add_funds`),
    onSuccess: (view) => absorb(client, view),
  })
}

export function useCancelOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & OrderCancelBody) =>
      await apiRequest<OrderView>('POST', `/orders/${id}/cancel`, body),
    onSuccess: (view) => absorb(client, view),
  })
}

export function useSendToRefiner() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, refiner_id }: { id: string; refiner_id: string }) =>
      await apiRequest<OrderView>('POST', `/orders/${id}/send_to_refiner`, { refiner_id }),
    onSuccess: (view) => absorb(client, view),
  })
}

export function useCreateOrderItem() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ order_id, patch }: { order_id: string; patch: OrderItemPatch }) =>
      await apiRequest<OrderItem>('POST', `/orders/${order_id}/items`, patch),
    onSuccess: (_line, { order_id }) => invalidateOrder(client, order_id),
  })
}

export function usePatchOrderItem() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({
      item_id,
      patch,
    }: {
      item_id: string
      order_id: string
      patch: OrderItemPatch
    }) => await apiRequest<OrderItem>('PATCH', `/orders/items/${item_id}`, patch),
    onSuccess: (_line, { order_id }) => invalidateOrder(client, order_id),
  })
}

export function useDeleteOrderItem() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ item_id }: { item_id: string; order_id: string }) =>
      await apiRequest<{ success: true }>('DELETE', `/orders/items/${item_id}`),
    onSuccess: (_answer, { order_id }) => invalidateOrder(client, order_id),
  })
}

export function useSetOrderSpots() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ order_id, ...body }: { order_id: string } & OrderSpotsPutBody) =>
      await apiRequest<unknown>('PUT', `/orders/${order_id}/spots`, body),
    onSuccess: (_answer, { order_id }) => invalidateOrder(client, order_id),
  })
}
