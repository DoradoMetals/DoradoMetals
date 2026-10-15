'use client'

import { useQuery } from '@tanstack/react-query'
import type { SelectionSummary } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useSelectionSummary(orderIds: string[], options: { enabled?: boolean } = {}) {
  return useQuery<SelectionSummary>({
    queryKey: keys.pricing.selection(orderIds),
    enabled: (options.enabled ?? true) && orderIds.length > 0,
    queryFn: () =>
      apiRequest<SelectionSummary>('GET', '/pricing/selection', undefined, {
        order_ids: orderIds,
      }),
  })
}
