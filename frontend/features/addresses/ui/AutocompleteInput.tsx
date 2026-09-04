'use client'

// The app's face of @dorado/components' Autocomplete. The library owns the
// anatomy, the combobox semantics and the keyboard (aria-activedescendant,
// arrows, Enter, Escape); this holds the wiring to the API's own suggestions.
import { Autocomplete, Button, MapPin, X } from '@dorado/components'
import type { PlaceSuggestion } from '@dorado/contracts'

export function AddressSearchInput({
  value,
  suggestions,
  busy = false,
  onChangeValue,
  onSelect,
  onClear,
}: {
  value: string
  suggestions: PlaceSuggestion[]
  busy?: boolean
  onChangeValue: (v: string) => void
  onSelect: (s: PlaceSuggestion) => void
  onClear: () => void
}) {
  const byId = new Map(suggestions.map((s) => [s.place_id, s]))

  return (
    <Autocomplete
      value={value}
      onValueChange={onChangeValue}
      items={suggestions.map((s) => ({
        id: s.place_id,
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
        if (s) onSelect(s)
      }}
      leading={<MapPin size={16} />}
      trailing={
        value ? (
          <Button variant="tertiary" size="iconXs" aria-label="Clear address search" onClick={onClear}>
            <X size={14} />
          </Button>
        ) : undefined
      }
      disabled={busy}
      placeholder={busy ? 'Loading' : 'Search...'}
    />
  )
}
