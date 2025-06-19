'use client'

import USMap from '@/components/ui/USMap'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandList, CommandItem } from '@/components/ui/command'
import { Check, X } from 'lucide-react'
import { StateTaxDetail, stateTaxData } from '@/types/tax'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import fuzzysort from 'fuzzysort'
import { cn } from '@/lib/utils'

export default function Page() {
  const [selected, setSelected] = useState<StateTaxDetail | null>(null)

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <USMap selected={selected} setSelected={setSelected} />
        <div className="w-full p-4">
          <div className="flex flex-col items-start w-full gap-1 mb-6">
            <div className="text-xs text-neutral-700">
              Please select a state on the map or in the search below to see the sales tax
              breakdown.
            </div>
            <div className="w-full">
              <StateDropdown selected={selected} setSelected={setSelected} />
            </div>
          </div>
          {selected && (
            <div className="bg-card rounded-lg p-4 w-full flex flex-col gap-3 raised-off-page">
              <div className="flex items-center w-full justify-between border-b border-border py-2">
                <div className="text-xl text-neutral-800 tracking-wide">{selected?.name}</div>
                <Image
                  src={`/flags/${selected.name}.svg`}
                  height={40}
                  width={40}
                  className="object-cover"
                  alt="thumbnail front"
                />
              </div>
              <div className="text-sm text-neutral-600">{selected?.header}</div>
              {selected?.bullets && selected?.bullets.length > 0 && (
                <ul className="list-disc list-outside mt-2 space-y-1 text-sm text-neutral-900 ml-6">
                  {selected!.bullets.map((bullet, i) => (
                    <li key={i} className="-pl-12">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface StateSelectProps {
  selected: StateTaxDetail | null
  setSelected: React.Dispatch<React.SetStateAction<StateTaxDetail | null>>
}

export function StateDropdown({ selected, setSelected }: StateSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const allStates = Object.values(stateTaxData)

  const preparedStates = allStates.map((s) => ({
    ...s,
    searchText: `${s.name}`,
  }))

  const filtered = query
    ? fuzzysort
        .go(query, preparedStates, {
          keys: ['searchText'],
          limit: 50,
          threshold: -10000,
        })
        .map((r) => r.obj)
    : []

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!filtered.length) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) =>
        prev === 0 ? filtered.length - 1 : prev - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selectedItem = filtered[highlightedIndex]
      if (selectedItem) {
        setSelected(selectedItem)
        setQuery(selectedItem.name)
        setOpen(false)
      }
    }
  }

  useEffect(() => {
    setHighlightedIndex(0)
  }, [query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <Input
            type="text"
            placeholder="Search states..."
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setOpen(e.currentTarget.value !== '')
            }}
            onKeyDown={handleKeyDown}
            className="cursor-text input-floating-label-form pr-8 focus:outline-none focus:ring-0 focus:ring-transparent"
          />
          {query !== '' && (
            <Button
              variant="ghost"
              onClick={(e) => {
                setQuery('')
                setOpen(false)
                e.stopPropagation()
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
              tabIndex={-1}
            >
              <X size={16} />
            </Button>
          )}
        </div>
      </PopoverTrigger>

      {query && (
        <PopoverContent
          align="start"
          side="bottom"
          className="w-[var(--radix-popover-trigger-width)] p-0 focus:outline-none focus:ring-0 focus:ring-transparent"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList className="max-h-40 overflow-y-auto">
              {filtered.map((detail, idx) => {
                const isActive = selected?.fips === detail.fips
                const isHighlighted = idx === highlightedIndex

                return (
                  <CommandItem
                    key={detail.fips}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onSelect={() => {
                      setSelected(detail)
                      setQuery(detail.name)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex items-center h-8 px-2 w-full justify-between hover:bg-card',
                      isHighlighted && 'bg-card text-neutral-900'
                    )}
                  >
                    {detail.name}
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        isActive ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  </CommandItem>
                )
              })}
              {filtered.length === 0 && (
                <div className="p-2 text-sm text-neutral-500">No states found.</div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  )
}