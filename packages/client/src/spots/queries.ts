'use client'

import { useQuery } from '@tanstack/react-query'
import type { SpotPrice } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

// The live market. An order's own spots are a different read - a frozen copy
// keyed by the order - and the Spots card shows this one only while unlocked.
export function useLiveSpots(options: { enabled?: boolean } = {}) {
  return useQuery<SpotPrice[]>({
    queryKey: keys.spots.live(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<SpotPrice[]>('GET', '/spots'),
  })
}
