'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  RefinerView,
  RefiningLot,
  RefiningLotPatch,
  RefiningLotsBody,
  RefiningOrder,
  RefiningOrderCreate,
  RefiningOrderPatch,
  RefiningOrderView,
  RefiningSettlement,
} from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

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
