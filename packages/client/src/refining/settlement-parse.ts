'use client'

import { useQuery } from '@tanstack/react-query'
import type { SettlementParse } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useSettlementParse(id: string, options: { enabled?: boolean } = {}) {
  return useQuery<SettlementParse>({
    queryKey: keys.refining.settlementParse(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    queryFn: () =>
      apiRequest<SettlementParse>('POST', `/refining/orders/${id}/settlement-lines/parse`),
  })
}
