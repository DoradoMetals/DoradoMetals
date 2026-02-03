'use client'

import { useMemo, useState } from 'react'
import fuzzysort from 'fuzzysort'

import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/shared/ui/base/command'
import { Button } from '@/shared/ui/base/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { CheckIcon } from '@phosphor-icons/react'

type PopoverSelectProps = {
  label?: string
  value: string | null
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
  triggerClass?: string
  popoverClass?: string
  includeSearch?: boolean

  /** Fuzzy search config */
  limit?: number
  /**
   * Optional: control what text is searched for each option.
   * Defaults to searching the option string itself.
   */
  getSearchText?: (option: string) => string
}

export function PopoverSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  triggerClass,
  popoverClass,
  includeSearch = true,
  limit = 60,
  getSearchText,
}: PopoverSelectProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const selected = useMemo(() => (value ? options.find((o) => o === value) ?? null : null), [options, value])

  const filtered: string[] = useMemo(() => {
    const input = q.trim()
    if (!includeSearch || !input) return options

    const rows = options.map((option) => ({
      option,
      searchText: getSearchText ? getSearchText(option) : option,
    }))

    return fuzzysort
      .go(input, rows, {
        keys: ['searchText'],
        limit,
        threshold: -10000,
      })
      .map((r) => r.obj.option)
  }, [options, q, includeSearch, limit, getSearchText])

  return (
    <div className="w-full flex flex-col gap-1">
      {label && <span className="text-xs text-neutral-700 font-medium pl-1">{label}</span>}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'p-0 m-0 px-3 w-full justify-between on-glass hover:on-glass',
              'text-neutral-900',
              triggerClass
            )}
          >
            {selected ? (
              <span className="truncate">{selected}</span>
            ) : (
              <span className="text-neutral-500">{placeholder}</span>
            )}
            <ChevronDown size={16} className="text-neutral-600" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          portalled={false}
          align="start"
          sideOffset={4}
          className={cn(
            'z-140 w-[var(--radix-popover-trigger-width)] min-w-0 max-w-none',
            'on-glass',
            popoverClass
          )}
        >
          <Command className="w-full glass-panel border-none">
            {includeSearch ? (
              <>
                <CommandInput
                  placeholder={`Search ${label || 'options'}...`}
                  value={q}
                  onValueChange={setQ}
                />
                <CommandSeparator className="m-0" />
              </>
            ) : null}

            <CommandList className="custom-scrollbar max-h-50 overflow-y-auto glass-panel border-none">
              <CommandEmpty>No results found.</CommandEmpty>

              <CommandGroup className="border-none">
                {filtered.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => {
                      onChange(option)
                      setOpen(false)
                    }}
                    className={cn(
                      'group cursor-pointer flex items-center justify-between w-full gap-2 bg-transparent my-1',
                      'text-neutral-800',
                      'data-[selected=true]:bg-primary/10',
                      'data-[selected=true]:rounded-lg',
                      value === option &&
                        'bg-primary/10 text-primary border border-primary rounded-lg'
                    )}
                  >
                    <span className="truncate">{option}</span>

                    <CheckIcon
                      size={16}
                      className={cn(
                        'transition-opacity transition-colors',
                        value === option ? 'opacity-100 text-primary' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
