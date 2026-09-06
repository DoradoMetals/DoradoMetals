'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  PoolBalance,
  PoolEntry,
  PoolLockCreate,
  RefinerView,
  RefiningLot,
  RefiningLotPatch,
  RefiningLotsBody,
  RefiningOrderCreate,
  RefiningOrderPatch,
  RefiningOrderView,
  RefiningSettlement,
} from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'
import { invalidateOrder } from '../orders/mutations'

export function useAdminSuppliers(options: { enabled?: boolean } = {}) {
  return useQuery<RefinerView[]>({
    queryKey: keys.refining.suppliers(),
    queryFn: () => apiRequest<RefinerView[]>('GET', '/suppliers/get_all'),
    enabled: options.enabled ?? true,
  })
}

export function useRefiningOrders(
  filters: { refiner_id?: string; direction?: string; state?: string } = {},
  options: { enabled?: boolean } = {}
) {
  return useQuery<RefiningOrderView[]>({
    queryKey: keys.refining.orders(JSON.stringify(filters)),
    queryFn: () => apiRequest<RefiningOrderView[]>('GET', '/refining/orders', undefined, filters),
    enabled: options.enabled ?? true,
  })
}

export function useRefiningOrder(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefiningOrderView>({
    queryKey: keys.refining.order(id),
    queryFn: () => apiRequest<RefiningOrderView>('GET', `/refining/orders/${id}`),
    enabled: (options.enabled ?? true) && !!id,
  })
}

export function useRefiningLots(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<RefiningLot[]>({
    queryKey: keys.refining.lots(id),
    queryFn: () => apiRequest<RefiningLot[]>('GET', `/refining/orders/${id}/lots`),
    enabled: (options.enabled ?? true) && !!id,
  })
}

export function usePool(
  filters: { refiner_id?: string; metal_id?: string } = {},
  options: { enabled?: boolean } = {}
) {
  return useQuery<PoolBalance[]>({
    queryKey: keys.refining.pool(filters.refiner_id, filters.metal_id),
    queryFn: () => apiRequest<PoolBalance[]>('GET', '/refining/pool', undefined, filters),
    enabled: options.enabled ?? true,
  })
}

export function usePoolEntries(
  filters: { refiner_id?: string; metal_id?: string } = {},
  options: { enabled?: boolean } = {}
) {
  return useQuery<PoolEntry[]>({
    queryKey: keys.refining.poolEntries(filters.refiner_id, filters.metal_id),
    queryFn: () => apiRequest<PoolEntry[]>('GET', '/refining/pool/entries', undefined, filters),
    enabled: options.enabled ?? true,
  })
}

const refresh = (client: ReturnType<typeof useQueryClient>, id: string) => {
  client.invalidateQueries({ queryKey: keys.refining.order(id) })
  client.invalidateQueries({ queryKey: keys.refining.lots(id) })
}

export function useCreateRefiningOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: RefiningOrderCreate) =>
      apiRequest<RefiningOrderView>('POST', '/refining/orders', body),
    onSettled: () => client.invalidateQueries({ queryKey: ['refining', 'orders'] }),
  })
}

export function usePatchRefiningOrder(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: RefiningOrderPatch) =>
      apiRequest<RefiningOrderView>('PATCH', `/refining/orders/${id}`, patch),
    onSettled: () => refresh(client, id),
  })
}

export function useAssignRefiningLots(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: RefiningLotsBody) =>
      apiRequest<RefiningLot[]>('POST', `/refining/orders/${id}/lots`, body),
    onSettled: () => refresh(client, id),
  })
}

export function usePatchRefiningLot(refining_order_id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RefiningLotPatch }) =>
      apiRequest<RefiningLot>('PATCH', `/refining/lots/${id}`, patch),
    onSettled: () => refresh(client, refining_order_id),
  })
}

export function useRemoveRefiningLot(refining_order_id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>('DELETE', `/refining/lots/${id}`),
    onSettled: () => refresh(client, refining_order_id),
  })
}

export function useSendRefiningOrder(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => apiRequest<RefiningOrderView>('POST', `/refining/orders/${id}/send`),
    onSettled: () => refresh(client, id),
  })
}

export function useSettleRefiningOrder(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: RefiningSettlement) =>
      apiRequest<RefiningOrderView>('POST', `/refining/orders/${id}/settle`, body),
    onSettled: () => refresh(client, id),
  })
}

export function useLockFromPool() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: PoolLockCreate) =>
      apiRequest<PoolEntry>('POST', '/refining/pool/locks', body),
    onSettled: () => client.invalidateQueries({ queryKey: ['refining', 'pool'] }),
  })
}

// The customer's sales order, ordered from a supplier: the URL is the order's,
// the answer is the refiner order it opened.
export function useSupplyOrder(order_id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (refiner_id: string) =>
      apiRequest<RefiningOrderView>('POST', `/orders/${order_id}/supply`, { refiner_id }),
    onSettled: () => {
      invalidateOrder(client, order_id)
      client.invalidateQueries({ queryKey: ['refining', 'orders'] })
    },
  })
}
