'use client'

import {
  Address,
  ParsedPlaceSuggestion,
  PlacesJsAutocompleteResponse,
  PlacesSuggestionsInput,
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

export const useCreateAddress = () =>
  useApiMutation<Address, Address, Address[]>({
    queryKey: queryKeys.address(),
    url: '/addresses/create',
    requireUser: true,
    listAction: 'create',
    listInsertPosition: 'start',
    body: (address, user) => ({
      user_id: user!.id,
      address,
    }),
  })

export const useUpdateAddress = () =>
  useApiMutation<Address, Address, Address[]>({
    queryKey: queryKeys.address(),
    url: '/addresses/update',
    requireUser: true,
    body: (address, user) => ({
      user_id: user!.id,
      address,
    }),
  })

export const useDeleteAddress = () =>
  useApiMutation<void, Address, Address[]>({
    queryKey: queryKeys.address(),
    method: 'DELETE',
    url: '/addresses/delete',
    requireUser: true,
    listAction: 'delete',
    optimisticItemKey: 'id',
    body: (address, user) => ({
      user_id: user!.id,
      address,
    }),
  })

export const useSetDefaultAddress = () =>
  useApiMutation<void, Address, Address[]>({
    queryKey: queryKeys.address(),
    url: '/addresses/set_default',
    requireUser: true,
    body: (address, user) => ({
      user_id: user!.id,
      address,
    }),
    optimisticUpdater: (list, address) => {
      const items = list ?? []

      return items.map((a) => ({
        ...a,
        is_default: a.id === address.id,
      }))
    },
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
