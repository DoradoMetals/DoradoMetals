'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Lot,
  OrderDocument,
  PaymentView,
  RefinerView,
  RefiningLot,
  RefiningLotsBody,
  RefiningBatch,
  RefiningBatchResult,
  RefiningDirection,
  RefiningLotPatchBody,
  RefiningOrderCreate,
  RefiningOrderList,
  RefiningOrderPatchBody,
  RefiningOrderRead,
  RefiningPricing,
  RefiningSettlement,
  RefiningSpot,
  SettlementLine,
} from '@dorado/contracts'

import { apiRequest, apiRequestBlob, apiRequestForm, baseUrl } from '../fetch'
import { keys } from '../keys'

export type RefiningOrderListFilters = {
  refiner_id?: string | null
  direction?: RefiningDirection | null
  state?: string | null
  assigned_to_id?: string | null
  sort?: string | null
  limit?: number | null
  offset?: number | null
}

export function useRefiningOrders(
  filters: RefiningOrderListFilters = {},
  options: { enabled?: boolean } = {}
) {
  const params = {
    refiner_id: filters.refiner_id ?? null,
    direction: filters.direction ?? null,
    state: filters.state ?? null,
    assigned_to_id: filters.assigned_to_id ?? null,
    sort: filters.sort ?? null,
    limit: filters.limit ?? null,
    offset: filters.offset ?? null,
  }
  return useQuery<RefiningOrderList>({
    queryKey: keys.refining.list(params),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<RefiningOrderList>('GET', '/refining/orders', undefined, params),
  })
}

export function useRefiningOrder(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefiningOrderRead>({
    queryKey: keys.refining.view(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<RefiningOrderRead>('GET', `/refining/orders/${id}`),
  })
}

export function useRefiningPricing(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefiningPricing>({
    queryKey: keys.refining.pricing(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () =>
      apiRequest<RefiningPricing>('POST', '/quotes/refining_order', { refining_order_id: id }),
  })
}

export function useSettlementLines(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<SettlementLine[]>({
    queryKey: keys.refining.settlementLines(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<SettlementLine[]>('GET', `/refining/orders/${id}/settlement-lines`),
  })
}

export function useRefiningLots(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefiningLot[]>({
    queryKey: keys.refining.lots(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<RefiningLot[]>('GET', `/refining/orders/${id}/lots`),
  })
}

export function useRefiningSpots(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefiningSpot[]>({
    queryKey: keys.refining.spots(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<RefiningSpot[]>('GET', `/refining/orders/${id}/spots`),
  })
}

export function useRefiningPayment(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<PaymentView>({
    queryKey: keys.refining.payment(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<PaymentView>('GET', `/refining/orders/${id}/payment`),
  })
}

export function useRefiningDocuments(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<OrderDocument[]>({
    queryKey: keys.refining.documents(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<OrderDocument[]>('GET', `/refining/orders/${id}/documents`),
  })
}

export function useRefiners(options: { enabled?: boolean } = {}) {
  return useQuery<RefinerView[]>({
    queryKey: keys.refining.refiners(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<RefinerView[]>('GET', '/suppliers/get_all'),
  })
}

function useRefiningWrite<TVariables, TResult>(run: (variables: TVariables) => Promise<TResult>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.refining.all() })
      client.invalidateQueries({ queryKey: keys.orders.all() })
    },
  })
}

export function useCreateRefiningOrder() {
  return useRefiningWrite((body: RefiningOrderCreate) =>
    apiRequest<RefiningOrderRead>('POST', '/refining/orders', body)
  )
}

export function useBatchRefiningOrders() {
  return useRefiningWrite((body: RefiningBatch) =>
    apiRequest<RefiningBatchResult>('POST', '/refining/orders/batch', body)
  )
}

export function usePatchRefiningOrder(id: string) {
  return useRefiningWrite((patch: RefiningOrderPatchBody) =>
    apiRequest<RefiningOrderRead>('PATCH', `/refining/orders/${id}`, patch)
  )
}

export function useSendRefiningOrder(id: string) {
  return useRefiningWrite(() =>
    apiRequest<RefiningOrderRead>('POST', `/refining/orders/${id}/send`, {})
  )
}

export function useSettleRefiningOrder(id: string) {
  return useRefiningWrite((body: RefiningSettlement) =>
    apiRequest<RefiningOrderRead>('POST', `/refining/orders/${id}/settle`, body)
  )
}

export function useAssignRefiningLots(id: string) {
  return useRefiningWrite((body: RefiningLotsBody) =>
    apiRequest<RefiningLot[]>('POST', `/refining/orders/${id}/lots`, body)
  )
}

export function usePatchRefiningLot() {
  return useRefiningWrite(({ lot_id, patch }: { lot_id: string; patch: RefiningLotPatchBody }) =>
    apiRequest<Lot>('PATCH', `/refining/lots/${lot_id}`, patch)
  )
}

export function useDeleteRefiningLot() {
  return useRefiningWrite((lot_id: string) =>
    apiRequest<null>('DELETE', `/refining/lots/${lot_id}`)
  )
}

export function useCancelRefiningOrder(id: string) {
  return useRefiningWrite(() =>
    apiRequest<RefiningOrderRead>('POST', `/refining/orders/${id}/cancel`, {})
  )
}

export function useMarkRefiningOrderReturned(id: string) {
  return useRefiningWrite(() =>
    apiRequest<RefiningOrderRead>('POST', `/refining/orders/${id}/returned`, {})
  )
}

export function useImportRefiningDocument(id: string) {
  return useRefiningWrite(({ kind, file }: { kind: string; file: File }) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return apiRequestForm<OrderDocument>('POST', `/refining/orders/${id}/documents/${kind}`, form)
  })
}

export const refiningDocumentUrl = (id: string, kind: string): string =>
  `${baseUrl()}/refining/orders/${id}/documents/${kind}`

export function downloadRefiningDocument(id: string, kind: string): Promise<Blob> {
  return apiRequestBlob('GET', `/refining/orders/${id}/documents/${kind}`)
}
