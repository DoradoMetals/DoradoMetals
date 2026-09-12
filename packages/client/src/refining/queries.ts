'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  OrderDocument,
  PaymentView,
  RefinerView,
  RefiningLot,
  RefiningLotPatch,
  RefiningLotsBody,
  RefiningOrder,
  RefiningDirection,
  RefiningOrderCreate,
  RefiningOrderPatch,
  RefiningOrderView,
  RefiningSettlement,
  RefiningSpot,
} from '@dorado/contracts'

import { apiRequest, apiRequestForm } from '../fetch'
import { keys } from '../keys'

export function useRefiningOrders(
  filters: {
    refiner_id?: string | null
    direction?: RefiningDirection | null
    state?: string | null
  } = {},
  options: { enabled?: boolean } = {}
) {
  const refiner_id = filters.refiner_id ?? null
  const direction = filters.direction ?? null
  const state = filters.state ?? null
  return useQuery<RefiningOrderView[]>({
    queryKey: keys.refining.list(refiner_id, direction, state),
    enabled: options.enabled ?? true,
    queryFn: () =>
      apiRequest<RefiningOrderView[]>('GET', '/refining/orders', undefined, {
        refiner_id,
        direction,
        state,
      }),
  })
}

export function useRefiningOrder(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefiningOrderView>({
    queryKey: keys.refining.view(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () => apiRequest<RefiningOrderView>('GET', `/refining/orders/${id}`),
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
    apiRequest<RefiningOrder>('POST', '/refining/orders', body)
  )
}

export function usePatchRefiningOrder(id: string) {
  return useRefiningWrite((patch: RefiningOrderPatch) =>
    apiRequest<RefiningOrderView>('PATCH', `/refining/orders/${id}`, patch)
  )
}

export function useSendRefiningOrder(id: string) {
  return useRefiningWrite(() =>
    apiRequest<RefiningOrderView>('POST', `/refining/orders/${id}/send`, {})
  )
}

export function useSettleRefiningOrder(id: string) {
  return useRefiningWrite((body: RefiningSettlement) =>
    apiRequest<RefiningOrderView>('POST', `/refining/orders/${id}/settle`, body)
  )
}

export function useAssignRefiningLots(id: string) {
  return useRefiningWrite((body: RefiningLotsBody) =>
    apiRequest<RefiningLot[]>('POST', `/refining/orders/${id}/lots`, body)
  )
}

export function usePatchRefiningLot() {
  return useRefiningWrite(({ lot_id, patch }: { lot_id: string; patch: RefiningLotPatch }) =>
    apiRequest<RefiningLot>('PATCH', `/refining/lots/${lot_id}`, patch)
  )
}

export function useDeleteRefiningLot() {
  return useRefiningWrite((lot_id: string) =>
    apiRequest<null>('DELETE', `/refining/lots/${lot_id}`)
  )
}

export function useCancelRefiningOrder(id: string) {
  return useRefiningWrite(() =>
    apiRequest<RefiningOrderView>('POST', `/refining/orders/${id}/cancel`, {})
  )
}

export function useImportRefiningDocument(id: string) {
  return useRefiningWrite(({ kind, file }: { kind: string; file: File }) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return apiRequestForm<OrderDocument>('POST', `/refining/orders/${id}/documents/${kind}`, form)
  })
}
