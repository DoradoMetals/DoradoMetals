'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDebouncedValue } from '@/shared/hooks/useDebounce'
import { usePlacesSuggestions } from '@/features/addresses/lib/queries'
import { ParsedPlaceSuggestion } from '@/features/addresses/types'

export function usePlacesAutocompleteController({
  userId,
  initialValue = '',
  debounceMs = 250,
  onPlaceSelected,
}: {
  userId?: string
  initialValue?: string
  debounceMs?: number
  onPlaceSelected: (args: {
    place: google.maps.places.Place
    formatted?: string
    suggestion: ParsedPlaceSuggestion
  }) => void | Promise<void>
}) {
  const [searchText, setSearchText] = useState(initialValue)
  const debouncedSearch = useDebouncedValue(searchText, debounceMs)

  const sessionToken = useMemo(() => new google.maps.places.AutocompleteSessionToken(), [])
  const { data: suggestions = [] } = usePlacesSuggestions({
    userId,
    sessionToken,
    searchText: debouncedSearch,
  })

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const placesReady =
    !!window.google?.maps?.places?.AutocompleteSuggestion && !!window.google?.maps?.places?.Place

  const open = () => setDropdownOpen(true)
  const close = () => setDropdownOpen(false)

  const clear = () => {
    setSearchText('')
    setDropdownOpen(false)
    setActiveIndex(-1)
  }

  const onChangeValue = (v: string) => {
    setSearchText(v)
    setDropdownOpen(true)
  }

  const selectSuggestion = async (s: ParsedPlaceSuggestion) => {
    const p = s.raw
    if (!p?.toPlace) return

    const place = p.toPlace()
    await place.fetchFields({ fields: ['formattedAddress', 'addressComponents'] } as any)

    const formatted = (place.formattedAddress as string) || s.fullText || s.main || undefined
    if (formatted) setSearchText(formatted)

    await onPlaceSelected({ place, formatted, suggestion: s })

    setDropdownOpen(false)
    setActiveIndex(-1)
  }

  useEffect(() => {
    if (activeIndex >= suggestions.length) setActiveIndex(suggestions.length - 1)
  }, [suggestions.length, activeIndex])

  return {
    placesReady,
    searchText,
    suggestions,
    dropdownOpen,
    activeIndex,
    onChangeValue,
    open,
    close,
    setActiveIndex,
    selectSuggestion,
    clear,
  }
}
