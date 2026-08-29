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
import { Button, type ButtonEmphasis, type ButtonIntent } from '@/shared/ui/base/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { CheckIcon } from '@phosphor-icons/react'
import { Field } from '@/shared/ui/Field'

/* THE TRIGGER'S APPEARANCE IS A VARIANT, NOT A `triggerClass`.

   Every caller that wanted a bordered trigger was writing
   `triggerClass="border border-border"` by hand - LeadsDrawer still does -
   because this component hard-coded `variant="tertiary"` and then painted over it
   with `text-neutral-900`, which is ruling 20's "variant contradicted" defect
   in a shared component rather than at a call site.

   `variant`/`intent` now forward straight to the Button, so a bordered trigger
   is `variant="secondary"` and nobody spells a border. `triggerClass` survives
   for LAYOUT ONLY - `shared/ui/table/Columns.tsx` passes `h-8 px-2` to fit a
   filter into a table header, which is the parent dictating extent. */
type PopoverSelectProps = {
  label?: string
  value: string | null
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
  /** Emphasis, forwarded to the trigger Button. `secondary` gives a hairline
   *  border; `tertiary` (the default) is bare. */
  variant?: ButtonEmphasis
  /** Meaning, forwarded to the trigger Button. */
  intent?: ButtonIntent
  /** LAYOUT ONLY - height, padding, width. Never appearance. */
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
  variant = 'tertiary',
  intent,
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

  const control = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          intent={intent}
          role="combobox"
          aria-expanded={open}
          className={cn('m-0 w-full justify-between', triggerClass)}
        >
          {/* Chosen value vs placeholder is a STATE of this control, not an
              override of the Button's variant - the same distinction
              `placeholder:text-neutral-500` makes on an Input. */}
          {selected ? (
            <span className="truncate text-foreground">{selected}</span>
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
        /* `bg-transparent border border-border` used to sit here: one class
           CANCELLING PopoverContent's own surface and two RE-ASSERTING the
           hairline it already draws. Ruling 28's second half — a
           `bg-transparent` at a call site is either a wrong default or a
           hand-rolled "no chrome", and here it was neither: the `Command`
           inside fills the box, so the shell's own surface was never visible. */
        className={cn(
          'z-140 w-[var(--radix-popover-trigger-width)] min-w-0 max-w-none',
          popoverClass
        )}
      >
        <Command surface="highest" className="w-full">
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

          <CommandList className="custom-scrollbar max-h-50 overflow-y-auto">
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup>
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
  )

  /* The label and the gap between it and the control are `Field`'s job,
     not this file's - it had grown its own `<small className="pl-1">`,
     one point LARGER than the `<Label>` every hand-rolled field beside it
     used, so a drawer showed two label sizes in one column. */
  return label ? (
    <Field label={label} className="w-full">
      {control}
    </Field>
  ) : (
    <div className="w-full">{control}</div>
  )
}
