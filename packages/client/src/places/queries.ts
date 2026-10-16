'use client'

import { useQuery } from '@tanstack/react-query'
import type { AddressBookEntry, LocationView } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useLocations(options: { organization_id?: string | null; enabled?: boolean } = {}) {
  const organization_id = options.organization_id ?? null
  return useQuery<LocationView[]>({
    queryKey: keys.places.locations(organization_id),
    enabled: options.enabled ?? true,
    queryFn: () => apiRequest<LocationView[]>('GET', '/locations', undefined, { organization_id }),
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
