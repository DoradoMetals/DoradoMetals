'use client'

// EVERY ADDRESS HOOK IS `@dorado/client`'S NOW. This file is a re-export plus a
// four-hook compatibility layer, kept for the same reason
// `features/shipping/queries.ts` is: files the checkout and orders lanes own
// import these names, and rewriting somebody else's file is how two lanes
// collide.
//
// THE API SERVES ONE READ. `GET /api/addresses` answers an AddressBookEntry -
// the postal row, the caller's link and what may be done to it - where two
// endpoints used to be joined by address_id in the browser. The four names
// below are that one read, projected; they are the shim, not the shape, and
// they go when those two lanes adopt `useAddressBook`.
export {
  useAddressBook,
  useAddress as useAddressEntry,
  useCreateAddress,
  useUpdateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
  usePlaceSuggestions,
  useLookupPlace,
} from '@dorado/client'

import { useMemo } from 'react'
import { useAddressBook } from '@dorado/client'
import type { Address, AddressBookEntry, UserAddressRead } from '@dorado/contracts'

// MEMOISED, because a projection is a new array every render and several
// callers put it in a useMemo dependency list.
function projected<T>(
  book: ReturnType<typeof useAddressBook>,
  pick: (e: AddressBookEntry) => T
): { data: T[]; isLoading: boolean; isPending: boolean } {
  const data = useMemo(() => (book.data ?? []).map(pick), [book.data])
  return { data, isLoading: book.isLoading, isPending: book.isPending }
}

export const useAddress = () => projected(useAddressBook(), (e) => e.address as Address)
export const useUserAddresses = () =>
  projected(useAddressBook(), (e) => e.user_address as UserAddressRead)
export const useUserAddress = (userId: string) =>
  projected(useAddressBook({ subject: userId, enabled: !!userId }), (e) => e.address as Address)
export const useUserAddressLinks = (userId: string) =>
  projected(
    useAddressBook({ subject: userId, enabled: !!userId }),
    (e) => e.user_address as UserAddressRead
  )
