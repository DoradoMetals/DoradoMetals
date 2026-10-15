'use client'

import * as React from 'react'
import type { OrderState as OrderStateValue } from '@dorado/contracts'
import { cn, RadioGroup, RadioOption } from '@dorado/components'

export type OrderFilterValue = 'all' | OrderStateValue

export type OrderFilterChip = { value: OrderFilterValue; label?: React.ReactNode }

export const purchaseStateFilters: OrderFilterChip[] = [
  { value: 'all', label: 'All' },
  { value: 'Awaiting Receipt' },
  { value: 'Awaiting Finalize' },
  { value: 'At Refiner' },
  { value: 'Ready to Pay' },
  { value: 'Completed' },
  { value: 'Cancelled' },
]

export const saleStateFilters: OrderFilterChip[] = [
  { value: 'all', label: 'All' },
  { value: 'Awaiting Payment' },
  { value: 'Preparing' },
  { value: 'In Transit' },
  { value: 'Completed' },
  { value: 'Cancelled' },
]

export type OrderFilterBarProps = {
  chips: OrderFilterChip[]
  value: OrderFilterValue
  onValueChange: (value: OrderFilterValue) => void
  label?: string
  className?: string
}

export function OrderFilterBar({
  chips,
  value,
  onValueChange,
  label = 'Order state',
  className,
}: OrderFilterBarProps) {
  return (
    <RadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onValueChange={(next) => onValueChange(next as OrderFilterValue)}
      className={cn('flex flex-wrap items-center gap-xs', className)}
    >
      {chips.map((chip) => (
        <RadioOption key={chip.value} variant="chip" value={chip.value}>
          {chip.label ?? chip.value}
        </RadioOption>
      ))}
    </RadioGroup>
  )
}

export type OrderPartyFilterProps = {
  items: { value: string; label: React.ReactNode }[]
  value: string
  onValueChange: (value: string) => void
  label?: string
  className?: string
}

export function OrderPartyFilter({
  items,
  value,
  onValueChange,
  label = 'Showing',
  className,
}: OrderPartyFilterProps) {
  return (
    <RadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onValueChange={onValueChange}
      className={cn('flex items-center gap-xs', className)}
    >
      {items.map((item) => (
        <RadioOption key={item.value} variant="chip" value={item.value}>
          {item.label}
        </RadioOption>
      ))}
    </RadioGroup>
  )
}
