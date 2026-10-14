'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RateBandsBody, RateChangePage, RatePay } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useRatePay(unit = 'troy_oz', options: { enabled?: boolean } = {}) {
  return useQuery<RatePay[]>({
    queryKey: keys.rates.pay(unit),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<RatePay[]>('GET', '/rates', undefined, { unit }),
  })
}

export function useRateChanges(
  filters: { q?: string | null; page?: number } = {},
  options: { enabled?: boolean } = {}
) {
  const q = filters.q ?? null
  const page = filters.page ?? 1
  return useQuery<RateChangePage>({
    queryKey: keys.rates.changes(q, page),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<RateChangePage>('GET', '/rates/changes', undefined, { q, page }),
  })
}

export function useReplaceRateBands(metalId: string, unit = 'troy_oz') {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: RateBandsBody) =>
      apiRequest<RatePay[]>('PATCH', `/rates/${encodeURIComponent(metalId)}`, body, { unit }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.rates.all() })
    },
  })
}
