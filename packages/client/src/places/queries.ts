'use client'

import { useQuery } from '@tanstack/react-query'
import type { AddressBookEntry, Location } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useLocations(options: { enabled?: boolean } = {}) {
  return useQuery<Location[]>({
    queryKey: keys.places.locations(),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<Location[]>('GET', '/locations'),
  })
}

export function useAddressBook(userId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery<AddressBookEntry[]>({
    queryKey: keys.places.addresses(userId ?? ''),
    enabled: (options.enabled ?? true) && !!userId,
    queryFn: () =>
      apiRequest<AddressBookEntry[]>('GET', '/addresses', undefined, { user_id: userId }),
  })
}
