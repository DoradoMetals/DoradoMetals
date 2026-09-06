'use client'

import { useQuery } from '@tanstack/react-query'
import type { AdminUser } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

// Who an order can be assigned to.
export function useAdmins(options: { enabled?: boolean } = {}) {
  return useQuery<AdminUser[]>({
    queryKey: keys.users.admins(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<AdminUser[]>('GET', '/users/admins'),
  })
}

export function useAdminUser(id: string | null, options: { enabled?: boolean } = {}) {
  return useQuery<AdminUser>({
    queryKey: keys.users.one(id ?? ''),
    enabled: (options.enabled ?? true) && !!id,
    queryFn: () => apiRequest<AdminUser>('GET', `/users/${id}`),
  })
}
