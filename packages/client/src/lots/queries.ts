'use client'

import { useQuery } from '@tanstack/react-query'
import type { LotView } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useLotSearch(q: string, unassigned: boolean, options: { enabled?: boolean } = {}) {
  return useQuery<LotView[]>({
    queryKey: keys.lots.search(q, unassigned),
    enabled: (options.enabled ?? true) && q.trim().length > 0,
    queryFn: () =>
      apiRequest<LotView[]>('GET', '/lots', undefined, {
        q,
        unassigned: unassigned ? 'true' : '',
      }),
  })
}
