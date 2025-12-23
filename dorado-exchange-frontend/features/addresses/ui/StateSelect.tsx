'use client'

import * as React from 'react'
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import { cn } from '@/lib/utils'
import { Button } from '@/shared/ui/base/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/base/command'
import { Label } from '@/shared/ui/base/label'

import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react'
import { reverseStateMap, stateMap, states } from '@/features/addresses/types'

type StateItem = { code: string; name: string }

const STATE_ITEMS: StateItem[] = states
  .map((name) => {
    const code = reverseStateMap[name]
    return code ? { name, code } : null
  })
  .filter((x): x is StateItem => Boolean(x))

function normalizeToStateCode(value?: string | null): string {
  if (!value) return ''
  const v = String(value).trim()
  if (!v) return ''

  const upper = v.toUpperCase()
  if (upper.length === 2 && stateMap[upper]) return upper

  const exact = reverseStateMap[v]
  if (exact && stateMap[exact]) return exact

  const found = states.find((s) => s.toLowerCase() === v.toLowerCase())
  if (found) {
    const code = reverseStateMap[found]
    if (code && stateMap[code]) return code
  }

  return ''
}

function getStateNameFromCode(code?: string | null): string {
  if (!code) return ''
  const upper = String(code).toUpperCase()
  return stateMap[upper] ?? ''
}

export function StateComboboxField<TFieldValues extends FieldValues>({
  control,
  name,
  label = 'State',
  placeholder = 'Select a state…',
  searchPlaceholder = 'Search states…',
  disabled,
  className,
}: {
  control: Control<TFieldValues>
  name: FieldPath<TFieldValues>
  label?: string
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const code = normalizeToStateCode(field.value as any)
        const selectedName = getStateNameFromCode(code)

        return (
          <div className={cn('space-y-1 py-1', className)}>
            <Label className="text-xs text-neutral-700">{label}</Label>

            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="default"
                  role="combobox"
                  aria-expanded={open}
                  disabled={disabled}
                  className={cn(
                    'w-full bg-highest border-1 border-border hover:bg-highest justify-between max-h-9 text-sm md:text-base text-neutral-800 font-normal',
                    !selectedName && 'text-muted-foreground'
                  )}
                >
                  <span className="truncate text-neutral-800">
                    {selectedName ? selectedName : placeholder}
                  </span>
                  <CaretDownIcon className="text-neutral-600" size={16} />
                </Button>
              </PopoverTrigger>

              <PopoverContent
                align="start"
                className={cn(
                  'p-0 z-80',
                  'w-[var(--radix-popover-trigger-width)]',

                  'max-w-none'
                )}
              >
                <Command className="w-full bg-highest">
                  <CommandInput placeholder={searchPlaceholder} className="w-full bg-highest" />

                  <CommandList className="w-full">
                    <CommandEmpty>No states found.</CommandEmpty>

                    <CommandGroup className="max-h-60 overflow-auto">
                      {STATE_ITEMS.map((s) => {
                        const isSelected = s.code === code
                        return (
                          <CommandItem
                            key={s.code}
                            value={`${s.name} ${s.code}`}
                            onSelect={() => {
                              field.onChange(s.code)
                              setOpen(false)
                            }}
                            className={cn(
                              'hover:bg-background! cursor-pointer',
                              isSelected && 'bg-background'
                            )}
                          >
                            <CheckIcon
                              className={cn(isSelected ? 'opacity-100' : 'opacity-0')}
                              size={16}
                            />
                            <span className="flex-1 text-neutral-800">{s.name}</span>
                            <span className="text-xs text-neutral-600">{s.code}</span>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {fieldState.error?.message ? (
              <div className="text-xs text-destructive">{fieldState.error.message}</div>
            ) : null}
          </div>
        )
      }}
    />
  )
}
