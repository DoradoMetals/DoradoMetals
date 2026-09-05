'use client'

import { useQuery } from '@tanstack/react-query'
import type { SpotTicker } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

const TICK = 10_000

export function useSpotPrices(enabled = true) {
  return useQuery<SpotTicker[]>({
    queryKey: keys.spots.all(),
    queryFn: () => apiRequest<SpotTicker[]>('GET', '/spots'),
    enabled,
    refetchInterval: TICK,
  })
}
