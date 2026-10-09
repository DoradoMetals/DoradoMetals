'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Direction,
  FulfillmentDropoff,
  Lot,
  LotSplit,
  OrderCancelBody,
  OrderDocument,
  OrderList,
  OrderLotPatch,
  OrderLotView,
  OrderPatch,
  OrderSpot,
  OrderSpotsPutBody,
  OrderSort,
  OrderState,
  OrderSupplyBody,
  OrderView,
  ProfitBreakdown,
  RefiningOrderView,
  SearchHit,
  ShipmentView,
} from '@dorado/contracts'

import { apiRequest, apiRequestForm } from '../fetch'
import { keys } from '../keys'

export type OrderListFilters = {
  direction?: Direction | null
  user_id?: string | null
  state?: OrderState[] | null
  assigned_to_id?: string | null
  has_unassigned_lots?: boolean | null
  sort?: string | null
  limit?: number | null
  offset?: number | null
}

export function useOrders(filters: OrderListFilters = {}, options: { enabled?: boolean } = {}) {
  const params = {
    direction: filters.direction ?? null,
    user_id: filters.user_id ?? null,
    state: filters.state ?? null,
    assigned_to_id: filters.assigned_to_id ?? null,
    has_unassigned_lots: filters.has_unassigned_lots ?? null,
    sort: filters.sort ?? null,
    limit: filters.limit ?? null,
    offset: filters.offset ?? null,
  }
  return useQuery<OrderList>({
    queryKey: keys.orders.list(params),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<OrderList>('GET', '/orders', undefined, params),
  })
}

export function useOrderSorts(options: { enabled?: boolean } = {}) {
  return useQuery<OrderSort[]>({
    queryKey: keys.orders.sorts(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<OrderSort[]>('GET', '/orders/sorts'),
  })
}

export function useSearch(q: string, options: { enabled?: boolean } = {}) {
  return useQuery<SearchHit[]>({
    queryKey: keys.search.hits(q),
    enabled: (options.enabled ?? true) && q.trim().length > 1,
    queryFn: () => apiRequest<SearchHit[]>('GET', '/search', undefined, { q }),
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

export function useOrderShipments(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<ShipmentView[]>({
    queryKey: keys.orders.shipments(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<ShipmentView[]>('GET', `/orders/${id}/shipments`),
  })
}

export function useOrderDropoffs(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<FulfillmentDropoff[]>({
    queryKey: keys.orders.dropoffs(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<FulfillmentDropoff[]>('GET', `/orders/${id}/dropoffs`),
  })
}

export function useProfitBreakdown(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<ProfitBreakdown>({
    queryKey: keys.orders.profit(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () =>
      apiRequest<ProfitBreakdown>('POST', '/quotes/profit_breakdown', { order_id: id }),
  })
}

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
    apiRequest<OrderLotView | Lot>('PATCH', `/orders/lots/${lot_id}`, patch)
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

export function useCreateRefiningSale(id: string) {
  return useOrderWrite(id, (body: OrderSupplyBody) =>
    apiRequest<RefiningOrderView>('POST', `/orders/${id}/refining-sale`, body)
  )
}
