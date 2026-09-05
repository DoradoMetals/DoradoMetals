'use client'

import { useMemo, useState } from 'react'
import type { PlaceLookup, PlaceSuggestion } from '@dorado/contracts'
import { useLookupPlace, usePlaceSuggestions } from '@dorado/client'
import { useDebounce } from '@dorado/components'

const newSessionToken = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function usePlacesAutocompleteController({
  initialValue = '',
  debounceMs = 250,
  onPlaceSelected,
}: {
  initialValue?: string
  debounceMs?: number
  onPlaceSelected: (place: PlaceLookup) => void
}) {
  const [searchText, setSearchText] = useState(initialValue)
  const debouncedSearch = useDebounce(searchText, debounceMs)
  const sessionToken = useMemo(newSessionToken, [])

  const { data: suggestions = [] } = usePlaceSuggestions(debouncedSearch, sessionToken)
  const lookup = useLookupPlace()

  const selectSuggestion = (s: PlaceSuggestion) => {
    setSearchText(s.main)
    lookup.mutate(
      { place_id: s.place_id, session_token: sessionToken },
      {
        onSuccess: (place) => {
          if (place.formatted_address) setSearchText(place.formatted_address)
          onPlaceSelected(place)
        },
      }
    )
  }

  return {
    searchText,
    suggestions,
    isResolving: lookup.isPending,
    onChangeValue: setSearchText,
    selectSuggestion,
    clear: () => setSearchText(''),
  }
}
