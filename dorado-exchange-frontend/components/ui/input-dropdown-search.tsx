// src/components/ui/SearchableDropdown.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import * as fuzzysort from 'fuzzysort'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandList, CommandItem } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface SearchableDropdownProps<T> {
  items: T[]
  getLabel: (item: T) => string
  selected?: T | null
  onSelect: (item: T) => void
  placeholder?: string
  limit?: number
  inputClassname?: string
}

export function SearchableDropdown<T>({
  items,
  getLabel,
  selected,
  onSelect,
  placeholder = 'Search…',
  limit = 50,
  inputClassname,
}: SearchableDropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // prepare for fuzzysort
  const prepared = items.map((item) => ({
    item,
    searchText: getLabel(item),
  }))

  const results = query
    ? fuzzysort
        .go(query, prepared, {
          keys: ['searchText'],
          threshold: -10000,
          limit,
        })
        .map((r) => r.obj.item)
    : []

  useEffect(() => {
    setHighlightedIndex(0)
  }, [results.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((i) => (i + 1) % results.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((i) => (i - 1 + results.length) % results.length)
        break
      case 'Enter':
        e.preventDefault()
        const pick = results[highlightedIndex]
        if (pick) {
          onSelect(pick)
          setQuery(getLabel(pick))
          setOpen(false)
        }
        break
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <Input
            ref={inputRef}
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setOpen(e.currentTarget.value !== '')
            }}
            onKeyDown={handleKeyDown}
            className={inputClassname}
          />
          {query && (
            <Button
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                setQuery('')
                setOpen(false)
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0"
              size="icon"
              tabIndex={-1}
            >
              <XIcon size={16} />
            </Button>
          )}
        </div>
      </PopoverTrigger>

      {open && query && (
        <PopoverContent
          side="bottom"
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0 z-80"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList className="max-h-60 overflow-y-auto">
              {results.map((item, idx) => {
                const label = getLabel(item)
                const isActive = selected === item
                const isHighlighted = idx === highlightedIndex

                return (
                  <CommandItem
                    key={label + idx}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onSelect={() => {
                      onSelect(item)
                      setQuery(label)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex items-center justify-between px-2 h-8 cursor-pointer',
                      isHighlighted && 'bg-neutral-700',
                      isActive && 'font-medium'
                    )}
                  >
                    {label}
                  </CommandItem>
                )
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  )
}
