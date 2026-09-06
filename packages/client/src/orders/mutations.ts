'use client'

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  AdminOrderCreate,
  OrderCancelBody,
  OrderCreateBody,
  OrderLotView,
  LotSplit,
  OrderLotPatch,
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

export function useFinalizeOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      await apiRequest<OrderView>('POST', `/orders/${id}/finalize`),
    onSuccess: (view) => absorb(client, view),
  })
}

export function useReopenOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      await apiRequest<OrderView>('POST', `/orders/${id}/reopen`),
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

export function useCreateOrderLot() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ order_id, patch }: { order_id: string; patch: OrderLotPatch }) =>
      await apiRequest<OrderLotView>('POST', `/orders/${order_id}/lots`, patch),
    onSuccess: (_line, { order_id }) => invalidateOrder(client, order_id),
  })
}

export function usePatchOrderLot() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({
      lot_id,
      patch,
    }: {
      lot_id: string
      order_id: string
      patch: OrderLotPatch
    }) => await apiRequest<OrderLotView>('PATCH', `/orders/lots/${lot_id}`, patch),
    onSuccess: (_line, { order_id }) => invalidateOrder(client, order_id),
  })
}

export function useDeleteOrderLot() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ lot_id }: { lot_id: string; order_id: string }) =>
      await apiRequest<void>('DELETE', `/orders/lots/${lot_id}`),
    onSuccess: (_answer, { order_id }) => invalidateOrder(client, order_id),
  })
}

export function useSplitOrderLot() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ lot_id, body }: { lot_id: string; order_id: string; body: LotSplit }) =>
      await apiRequest<OrderLotView[]>('POST', `/orders/lots/${lot_id}/split`, body),
    onSuccess: (_lines, { order_id }) => invalidateOrder(client, order_id),
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
