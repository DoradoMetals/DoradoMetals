'use client'

import * as React from 'react'
import {
  Controller,
  type Control,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form'

import { cn } from '@/shared/utils/cn'
import { Autocomplete, type AutocompleteItem } from '@dorado/components'
import { Check } from '@dorado/icons'
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

function StateAutocompleteRow<TFieldValues extends FieldValues>({
  field,
  fieldState,
  label,
  placeholder,
  disabled,
}: {
  field: ControllerRenderProps<TFieldValues, FieldPath<TFieldValues>>
  fieldState: ControllerFieldState
  label?: string
  placeholder?: string
  disabled?: boolean
}) {
  const code = normalizeToStateCode(field.value as any)
  const selectedName = getStateNameFromCode(code)
  const [query, setQuery] = React.useState(selectedName)

  React.useEffect(() => {
    setQuery(selectedName)
  }, [selectedName])

  const trimmed = query.trim().toLowerCase()
  const filtered = trimmed
    ? STATE_ITEMS.filter((s) => `${s.name} ${s.code}`.toLowerCase().includes(trimmed))
    : STATE_ITEMS

  const items: AutocompleteItem[] = filtered.map((s) => ({
    id: s.code,
    textValue: s.name,
    label: (
      <span className="flex w-full items-center gap-2">
        <Check className={cn(s.code === code ? 'opacity-100' : 'opacity-0')} size={16} />
        <span className="flex-1">{s.name}</span>
        <small>{s.code}</small>
      </span>
    ),
  }))

  return (
    <>
      <Autocomplete
        label={label}
        value={query}
        onValueChange={setQuery}
        items={items}
        onSelect={(item) => {
          field.onChange(item.id)
          setQuery(item.textValue)
        }}
        placeholder={placeholder}
        disabled={disabled}
        empty="No states found."
      />
      {fieldState.error?.message ? <p className="text-destructive">{fieldState.error.message}</p> : null}
    </>
  )
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
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className={cn('py-1', className)}>
          <StateAutocompleteRow
            field={field}
            fieldState={fieldState}
            label={label}
            placeholder={placeholder}
            disabled={disabled}
          />
        </div>
      )}
    />
  )
}
