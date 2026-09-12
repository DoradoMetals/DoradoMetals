'use client'

import { useQuery } from '@tanstack/react-query'
import type { Location } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useLocations(options: { enabled?: boolean } = {}) {
  return useQuery<Location[]>({
    queryKey: keys.places.locations(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<Location[]>('GET', '/locations'),
  })
}
