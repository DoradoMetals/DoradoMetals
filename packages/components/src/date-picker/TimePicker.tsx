'use client'

import * as React from 'react'
import { cn } from '../cn'
import { rovingIndex, rovingKeyDown } from '../hooks/roving'

export type TimeSlotShape = { value: string; label: string; available?: boolean }
export type TimeGroup = { label: string; slots: TimeSlotShape[] }

export type TimePickerProps = {
  heading?: React.ReactNode
  groups: TimeGroup[]
  value?: string | null
  onValueChange: (value: string) => void
  bare?: boolean
  columns?: 2 | 3
  className?: string
}

export function TimePicker({
  heading,
  groups,
  value,
  onValueChange,
  bare = false,
  columns = 2,
  className,
}: TimePickerProps) {
  const groupId = React.useId()
  const slots = groups.flatMap((g) => g.slots)
  const stop =
    slots[
      rovingIndex(
        slots,
        (s) => s.value === value,
        (s) => s.available !== false
      )
    ]?.value
  return (
    <div
      role="radiogroup"
      aria-label={typeof heading === 'string' ? heading : 'Appointment time'}
      onKeyDown={rovingKeyDown('[role="radio"]', { select: true })}
      className={cn(
        'flex w-full flex-col',
        bare ? 'gap-0' : 'gap-md rounded-lg border border-border bg-card p-md',
        className
      )}
    >
      {heading != null && (
        <h3
          className={cn(
            'font-medium text-muted-foreground',
            bare ? 'border-b border-border px-md py-sm text-center text-small' : 'text-h5'
          )}
        >
          {heading}
        </h3>
      )}
      {groups.map((group, gi) => (
        <div
          key={group.label}
          role="group"
          aria-labelledby={`${groupId}-${gi}`}
          className={cn(
            'flex flex-col gap-xs',
            bare && 'px-md py-sm',
            bare && gi > 0 && 'border-t border-border'
          )}
        >
          <span id={`${groupId}-${gi}`} className="text-micro font-medium text-muted-foreground">
            {group.label}
          </span>
          <div className={cn('grid gap-xs', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {group.slots.map((slot) => {
              const available = slot.available !== false
              const selected = slot.value === value
              return (
                <button
                  key={slot.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={slot.value === stop ? 0 : -1}
                  disabled={!available}
                  onClick={() => onValueChange(slot.value)}
                  className={cn(
                    'flex min-h-(--control-md) cursor-pointer items-center justify-center rounded-lg px-sm text-small font-medium transition-colors',
                    'focus-ring',
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : available
                        ? 'border border-border bg-card text-muted-foreground hover:bg-accent'
                        : 'border border-border bg-muted text-muted-foreground opacity-50'
                  )}
                >
                  {slot.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
