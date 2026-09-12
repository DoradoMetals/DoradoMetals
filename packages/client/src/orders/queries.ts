'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Direction,
  FulfillmentDropoff,
  LotSplit,
  OrderCancelBody,
  OrderDocument,
  OrderListItem,
  OrderLotPatch,
  OrderLotView,
  OrderPatch,
  OrderSpot,
  OrderSpotsPutBody,
  OrderSupplyBody,
  OrderView,
  ProfitBreakdown,
  RefiningOrderView,
  ShipmentView,
} from '@dorado/contracts'

import { apiRequest, apiRequestForm } from '../fetch'
import { keys } from '../keys'

// EVERY ORDER THE CALLER MAY SEE - the admin index's table. The route decides
// the scope, not this hook: an admin with no `user_id` gets all of them, a
// customer gets their own whatever they ask for. The filters are the route's
// own query parameters and go through `apiRequest`'s `params`, so the URL here
// stays the literal the route census reads.
export function useOrders(
  filters: { direction?: Direction | null; user_id?: string | null } = {},
  options: { enabled?: boolean } = {}
) {
  const direction = filters.direction ?? null
  const user_id = filters.user_id ?? null
  return useQuery<OrderListItem[]>({
    queryKey: keys.orders.list(direction, user_id),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<OrderListItem[]>('GET', '/orders', undefined, { direction, user_id }),
  })
}

export function useOrder(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<OrderView>({
    queryKey: keys.orders.view(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderView>('GET', `/orders/${id}`),
  })
}

export function useOrderSpots(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<OrderSpot[]>({
    queryKey: keys.orders.spots(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderSpot[]>('GET', `/orders/${id}/spots`),
  })
}

export function useOrderDocuments(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<OrderDocument[]>({
    queryKey: keys.orders.documents(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderDocument[]>('GET', `/orders/${id}/documents`),
  })
}

// The parcel read carries its own decisions - `timeline` is already the
// Tracker's steps and `actions` says what the card may offer.
export function useOrderShipments(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<ShipmentView[]>({
    queryKey: keys.orders.shipments(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<ShipmentView[]>('GET', `/orders/${id}/shipments`),
  })
}

// The refiner drop-offs booked against this order. Its own read, keyed by the
// order, because the fulfillment view carries one dropoff and this is the list.
export function useOrderDropoffs(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<FulfillmentDropoff[]>({
    queryKey: keys.orders.dropoffs(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<FulfillmentDropoff[]>('GET', `/orders/${id}/dropoffs`),
  })
}

// A read the API spells as a POST, because the body is the order id and the
// answer is derived. It caches like the read it is.
export function useProfitBreakdown(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<ProfitBreakdown>({
    queryKey: keys.orders.profit(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () =>
      apiRequest<ProfitBreakdown>('POST', '/quotes/profit_breakdown', { order_id: id }),
  })
}

// Every write on this screen changes the order's own view, and most change a
// sibling read too (a lot moves the totals, a spot moves every price). One
// invalidation of the order namespace is the honest answer; optimistic nothing.
function useOrderWrite<TVariables, TResult>(
  id: string,
  run: (variables: TVariables) => Promise<TResult>
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.orders.all() })
      client.invalidateQueries({ queryKey: keys.payments.view(id) })
    },
  })
}

export function usePatchOrder(id: string) {
  return useOrderWrite(id, (patch: OrderPatch) =>
    apiRequest<OrderView>('PATCH', `/orders/${id}`, patch)
  )
}

export function useFinalizeOrder(id: string) {
  return useOrderWrite(id, () => apiRequest<OrderView>('POST', `/orders/${id}/finalize`, {}))
}

export function useReopenOrder(id: string) {
  return useOrderWrite(id, () => apiRequest<OrderView>('POST', `/orders/${id}/reopen`, {}))
}

export function useCancelOrder(id: string) {
  return useOrderWrite(id, (body: OrderCancelBody) =>
    apiRequest<OrderView>('POST', `/orders/${id}/cancel`, body)
  )
}

export function useSupplyOrder(id: string) {
  return useOrderWrite(id, (body: OrderSupplyBody) =>
    apiRequest<unknown>('POST', `/orders/${id}/supply`, body)
  )
}

export function useAddFunds(id: string) {
  return useOrderWrite(id, () => apiRequest<OrderView>('POST', `/orders/${id}/add_funds`, {}))
}

export function usePutOrderSpots(id: string) {
  return useOrderWrite(id, (body: OrderSpotsPutBody) =>
    apiRequest<OrderSpot[]>('PUT', `/orders/${id}/spots`, body)
  )
}

export function useCreateOrderLot(id: string) {
  return useOrderWrite(id, (patch: OrderLotPatch) =>
    apiRequest<OrderLotView>('POST', `/orders/${id}/lots`, patch)
  )
}

export function usePatchOrderLot(id: string) {
  return useOrderWrite(id, ({ lot_id, patch }: { lot_id: string; patch: OrderLotPatch }) =>
    apiRequest<OrderLotView>('PATCH', `/orders/lots/${lot_id}`, patch)
  )
}

export function useDeleteOrderLot(id: string) {
  return useOrderWrite(id, (lot_id: string) => apiRequest<null>('DELETE', `/orders/lots/${lot_id}`))
}

export function useSplitOrderLot(id: string) {
  return useOrderWrite(id, ({ lot_id, parts }: { lot_id: string } & LotSplit) =>
    apiRequest<OrderLotView[]>('POST', `/orders/lots/${lot_id}/split`, { parts })
  )
}

export function useSendOrderDocument(id: string) {
  return useOrderWrite(id, (kind: string) =>
    apiRequest<OrderDocument>('POST', `/orders/${id}/documents/${kind}/send`, {})
  )
}

export function useImportOrderDocument(id: string) {
  return useOrderWrite(id, ({ kind, file }: { kind: string; file: File }) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return apiRequestForm<OrderDocument>('POST', `/orders/${id}/documents/${kind}`, form)
  })
}

// Create Sale: a finalized purchase order's lots wrapped onto the refiner's one
// open SELL order.
export function useCreateRefiningSale(id: string) {
  return useOrderWrite(id, (body: OrderSupplyBody) =>
    apiRequest<RefiningOrderView>('POST', `/orders/${id}/refining-sale`, body)
  )
}
