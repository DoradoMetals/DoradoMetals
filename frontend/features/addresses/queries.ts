'use client'

import {
  Address,
  AddressFormValues,
  ParsedPlaceSuggestion,
  PlacesJsAutocompleteResponse,
  PlacesSuggestionsInput,
  UserAddress,
  splitFormValues,
} from '@/features/addresses/types'
import { parsePlacesJsAutocomplete } from '@/features/addresses/utils/places'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'

export const useAddress = () =>
  useApiQuery<Address[]>({
    key: queryKeys.address(),
    url: '/addresses/get',
    requireUser: true,
    params: (user) => ({
      user_id: user!.id,
    }),
  })

// The other half of the book: what the caller names each address and which
// one is their default, joined to useAddress() client-side by address_id.
export const useUserAddresses = () =>
  useApiQuery<UserAddress[]>({
    key: queryKeys.userAddressLinks(),
    url: '/addresses/get_user_addresses',
    requireUser: true,
    params: (user) => ({
      user_id: user!.id,
    }),
  })

export const useUserAddress = (userId: string) =>
  useApiQuery<Address[]>({
    key: queryKeys.userAddresses(userId),
    url: '/addresses/get',
    requireAdmin: true,
    enabled: !!userId,
    params: () => ({
      user_id: userId,
    }),
  })

// The links for ANOTHER user's book - the admin sibling of useUserAddresses,
// same endpoint (it honors user_id for admins).
export const useUserAddressLinks = (userId: string) =>
  useApiQuery<UserAddress[]>({
    key: queryKeys.userAddressLinksFor(userId),
    url: '/addresses/get_user_addresses',
    requireAdmin: true,
    enabled: !!userId,
    params: () => ({
      user_id: userId,
    }),
  })

// One call, split body: the form's values divide into the postal address and
// the caller's relationship, and the server writes both in one transaction.
export type SavedAddress = { address: Address; user_address: UserAddress }

export const useCreateAddress = () =>
  useApiMutation<SavedAddress, AddressFormValues, Address[]>({
    queryKey: queryKeys.address(),
    url: '/addresses/create',
    requireUser: true,
    invalidateKeys: [queryKeys.userAddressLinks()],
    body: (values, user) => ({
      user_id: user!.id,
      ...splitFormValues(values),
    }),
  })

export const useUpdateAddress = () =>
  useApiMutation<SavedAddress, AddressFormValues & { id: string }, Address[]>({
    queryKey: queryKeys.address(),
    url: '/addresses/update',
    requireUser: true,
    invalidateKeys: [queryKeys.userAddressLinks()],
    body: (values, user) => {
      const { address, user_address } = splitFormValues(values)
      return {
        user_id: user!.id,
        address: { ...address, id: values.id },
        user_address,
      }
    },
  })

export const useDeleteAddress = () =>
  useApiMutation<void, Address, Address[]>({
    queryKey: queryKeys.address(),
    method: 'DELETE',
    url: '/addresses/delete',
    requireUser: true,
    listAction: 'delete',
    optimisticItemKey: 'id',
    invalidateKeys: [queryKeys.userAddressLinks()],
    body: (address, user) => ({
      user_id: user!.id,
      address_id: address.id,
    }),
  })

export const useSetDefaultAddress = () =>
  useApiMutation<void, UserAddress, UserAddress[]>({
    queryKey: queryKeys.userAddressLinks(),
    url: '/addresses/set_default',
    requireUser: true,
    body: (link, user) => ({
      user_id: user!.id,
      address_id: link.address_id,
    }),
    optimisticUpdater: (list, link) =>
      (list ?? []).map((l) => ({
        ...l,
        default_shipping: l.address_id === link.address_id,
      })),
  })

export function usePlacesSuggestions(input: PlacesSuggestionsInput) {
  const text = input.searchText.trim()

  return useApiQuery<ParsedPlaceSuggestion[]>({
    key: queryKeys.places({ ...input, searchText: text }),
    requireUser: true,
    enabled: input.searchText.length > 2,
    staleTime: Infinity,
    retry: false,

    request: async () => {
      const { AutocompleteSuggestion } = google.maps.places
      const resp = (await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: text,
        sessionToken: input.sessionToken,
        includedRegionCodes: ['us'],
      })) as PlacesJsAutocompleteResponse
      return parsePlacesJsAutocomplete(resp.suggestions ?? [])
    },
  })
}
