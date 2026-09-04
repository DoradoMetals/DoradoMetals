'use client'

// THE ADDRESS SEARCH, DRIVEN BY OUR OWN SERVER.
//
// It used to hold `google.maps.places.AutocompleteSuggestion` and
// `place.fetchFields` directly: a Google key shipped to every visitor, billed
// per keystroke, with the parse of Google's answer sitting in
// `utils/places.ts`. Both calls are API endpoints now
// (`GET /api/addresses/suggestions` and `/suggestions/:place_id`); what is left
// here is the typing experience - a debounce, and the session token that makes
// a burst of keystrokes and the pick that follows one billed session.
import { useMemo, useState } from 'react'
import type { PlaceLookup, PlaceSuggestion } from '@dorado/contracts'
import { useLookupPlace, usePlaceSuggestions } from '@dorado/client'
import { useDebouncedValue } from '@/shared/hooks/useDebounce'

// A token is an opaque string to everybody but Google, so the browser can mint
// one without the SDK. New per mounted form, which is what a "session" means.
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
  const debouncedSearch = useDebouncedValue(searchText, debounceMs)
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
