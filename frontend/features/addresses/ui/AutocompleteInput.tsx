'use client'

// The app's face of @dorado/components' Autocomplete: the Places wiring stays
// here (fetching, debouncing and parsing are the app's business), the anatomy,
// the combobox semantics and the keyboard all moved into the library.
//
// The signature is unchanged so AddressForm does not move. Three of its props
// are now vestigial and accepted for compatibility: `dropdownOpen`,
// `activeIndex` and `onActiveIndex` - the library owns the open state and the
// highlight (aria-activedescendant, arrows, Enter, Escape), which is exactly
// the code this file used to hand-roll. `onOpen`/`onClose` still fire on
// focus/blur because the hook listens.
import { MapPinIcon, XIcon } from '@phosphor-icons/react'
import { Autocomplete, Button } from '@dorado/components'
import { ParsedPlaceSuggestion } from '@/features/addresses/types'

export function AddressSearchInput({
  placesReady,
  value,
  suggestions,
  onChangeValue,
  onOpen,
  onClose,
  onSelect,
  onClear,
}: {
  placesReady: boolean
  value: string
  suggestions: ParsedPlaceSuggestion[]
  dropdownOpen?: boolean
  activeIndex?: number
  onChangeValue: (v: string) => void
  onOpen: () => void
  onClose: () => void
  onActiveIndex?: (updater: (i: number) => number) => void
  onSelect: (s: ParsedPlaceSuggestion) => void | Promise<void>
  onClear: () => void
}) {
  const byId = new Map(suggestions.map((s) => [s.placeId, s]))

  return (
    <Autocomplete
      value={value}
      onValueChange={onChangeValue}
      items={suggestions.map((s) => ({
        id: s.placeId,
        textValue: s.main,
        label: (
          <span className="flex min-w-0 flex-col gap-0.5 py-1 leading-tight">
            <strong className="truncate">{s.main}</strong>
            {!!s.secondary && <small className="truncate">{s.secondary}</small>}
          </span>
        ),
      }))}
      onSelect={(item) => {
        const s = byId.get(item.id)
        if (s) void onSelect(s)
      }}
      leading={<MapPinIcon size={16} />}
      trailing={
        value ? (
          <Button variant="tertiary" size="iconXs" aria-label="Clear address search" onClick={onClear}>
            <XIcon size={14} />
          </Button>
        ) : undefined
      }
      disabled={!placesReady}
      placeholder={placesReady ? 'Search...' : 'Loading'}
      inputProps={{ onFocus: onOpen, onBlur: onClose }}
    />
  )
}
