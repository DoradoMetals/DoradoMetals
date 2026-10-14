'use client'

import { useQuery } from '@tanstack/react-query'
import type { AdminUser, UserName } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

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

export const USER_NAMES_BATCH = 200

export function userNameIds(ids: readonly (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))].sort()
}

export function userNamesKey(ids: readonly (string | null | undefined)[]) {
  return keys.users.names(userNameIds(ids))
}

async function fetchUserNames(ids: string[]): Promise<UserName[]> {
  const batches: string[][] = []
  for (let start = 0; start < ids.length; start += USER_NAMES_BATCH) {
    batches.push(ids.slice(start, start + USER_NAMES_BATCH))
  }
  const pages = await Promise.all(
    batches.map((batch) =>
      apiRequest<UserName[]>('GET', '/users/names', undefined, { ids: batch.join(',') })
    )
  )
  return pages.flat()
}

export function useUserNames(ids: readonly (string | null | undefined)[]) {
  const list = userNameIds(ids)
  return useQuery<UserName[]>({
    queryKey: keys.users.names(list),
    enabled: list.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchUserNames(list),
  })
}
