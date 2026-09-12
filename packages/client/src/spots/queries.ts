'use client'

import { useQuery } from '@tanstack/react-query'
import type { SpotPrice } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useLiveSpots(options: { enabled?: boolean } = {}) {
  return useQuery<SpotPrice[]>({
    queryKey: keys.spots.live(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<SpotPrice[]>('GET', '/spots'),
  })
}
