'use client'

import { useMemo, useState, type InputHTMLAttributes } from 'react'
import * as fuzzysort from 'fuzzysort'
import { Autocomplete, Button, type AutocompleteItem } from '@dorado/components'
import { XIcon } from '@phosphor-icons/react'

export interface SearchableDropdownProps<T> {
  items: T[]
  getLabel: (item: T) => string
  selected?: T | null
  onSelect: (item: T) => void
  placeholder?: string
  limit?: number
  /** LAYOUT ONLY - width, height. Never appearance. */
  inputClassname?: string
  inputProps?: InputHTMLAttributes<HTMLInputElement>
}

export function SearchableDropdown<T>({
  items,
  getLabel,
  selected,
  onSelect,
  placeholder = 'Search…',
  limit = 50,
  inputClassname,
  inputProps,
}: SearchableDropdownProps<T>) {
  const [query, setQuery] = useState('')

  const prepared = useMemo(
    () => items.map((item) => ({ item, searchText: getLabel(item) })),
    [items, getLabel]
  )

  const results = query
    ? fuzzysort
        .go(query, prepared, {
          keys: ['searchText'],
          threshold: -10000,
          limit,
        })
        .map((r) => r.obj)
    : []

  const autocompleteItems: AutocompleteItem[] = results.map((r, index) => ({
    id: String(index),
    textValue: r.searchText,
    label: r.item === selected ? <strong>{r.searchText}</strong> : r.searchText,
  }))

  const handleSelect = (option: AutocompleteItem) => {
    const match = results[Number(option.id)]
    if (!match) return
    onSelect(match.item)
    setQuery(match.searchText)
  }

  return (
    <Autocomplete
      value={query}
      onValueChange={setQuery}
      items={autocompleteItems}
      onSelect={handleSelect}
      placeholder={placeholder}
      empty="No matches"
      className={inputClassname}
      inputProps={inputProps}
      trailing={
        query ? (
          <Button
            type="button"
            variant="tertiary"
            size="iconXs"
            onClick={() => setQuery('')}
            tabIndex={-1}
            aria-label="Clear"
          >
            <XIcon size={16} />
          </Button>
        ) : undefined
      }
    />
  )
}
