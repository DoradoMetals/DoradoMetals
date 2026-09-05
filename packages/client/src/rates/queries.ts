'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminRate, RatePatch, RateRead, RateTier } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useRates(enabled = true) {
  return useQuery<RateRead[]>({
    queryKey: keys.rates.all(),
    queryFn: () => apiRequest<RateRead[]>('GET', '/rates'),
    enabled,
  })
}

export function useRateTiers(enabled = true) {
  return useQuery<RateTier[]>({
    queryKey: keys.rates.tiers(),
    queryFn: () => apiRequest<RateTier[]>('GET', '/rates/tiers'),
    enabled,
  })
}

export function useAdminRates(enabled = true) {
  return useQuery<AdminRate[]>({
    queryKey: keys.rates.admin(),
    queryFn: () => apiRequest<AdminRate[]>('GET', '/rates/admin'),
    enabled,
  })
}

function invalidate(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: keys.rates.scoped() })
}

export function useCreateRate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: RatePatch) => apiRequest<AdminRate>('POST', '/rates', patch),
    onSettled: () => invalidate(client),
  })
}

export function useUpdateRate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RatePatch }) =>
      apiRequest<AdminRate>('PATCH', `/rates/${id}`, patch),
    onSettled: () => invalidate(client),
  })
}

export function useDeleteRate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>('DELETE', `/rates/${id}`),
    onSettled: () => invalidate(client),
  })
}
