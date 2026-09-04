'use client'

import * as React from 'react'
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'

import { cn } from '@/shared/utils/cn'
import { Button, Field } from '@dorado/components'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/base/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/base/command'

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
          <Field label={label} className={cn('py-1', className)}>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  role="combobox"
                  aria-expanded={open}
                  disabled={disabled}
                  className="w-full justify-between"
                >
                  <span className="truncate">{selectedName ? selectedName : placeholder}</span>
                  <CaretDownIcon size={16} />
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
                <Command surface="highest" className="w-full">
                  <CommandInput placeholder={searchPlaceholder} className="w-full" />

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
                            className="cursor-pointer"
                          >
                            <CheckIcon
                              className={cn(isSelected ? 'opacity-100' : 'opacity-0')}
                              size={16}
                            />
                            <span className="flex-1">{s.name}</span>
                            <small>{s.code}</small>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {fieldState.error?.message ? (
              <p className="text-destructive">{fieldState.error.message}</p>
            ) : null}
          </Field>
        )
      }}
    />
  )
}
