'use client'

import { useQuery } from '@tanstack/react-query'
import type { BullionAdmin } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useAdminProducts(options: { enabled?: boolean } = {}) {
  return useQuery<BullionAdmin[]>({
    queryKey: keys.products.admin(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<BullionAdmin[]>('GET', '/products/admin'),
  })
}
