'use client'

import * as React from 'react'
import { cn } from '../cn'

export type TimeSlotShape = { value: string; label: string; available?: boolean }
export type TimeGroup = { label: string; slots: TimeSlotShape[] }

export type TimePickerProps = {
  heading?: React.ReactNode
  groups: TimeGroup[]
  value?: string | null
  onValueChange: (value: string) => void
  bare?: boolean
  className?: string
}

export function TimePicker({
  heading,
  groups,
  value,
  onValueChange,
  bare = false,
  className,
}: TimePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={typeof heading === 'string' ? heading : 'Appointment time'}
      className={cn(
        'flex w-full flex-col',
        bare ? 'gap-0' : 'gap-4 rounded-lg border border-border bg-card p-4',
        className
      )}
    >
      {heading != null && (
        <h3
          className={cn(
            'font-medium text-muted-foreground',
            bare ? 'border-b border-border px-4 py-3.5 text-center text-small' : 'text-h5'
          )}
        >
          {heading}
        </h3>
      )}
      {groups.map((group, gi) => (
        <div
          key={group.label}
          className={cn(
            'flex flex-col gap-2',
            bare && 'px-4 py-3.5',
            bare && gi > 0 && 'border-t border-border'
          )}
        >
          <span className="text-micro font-medium text-muted-foreground">{group.label}</span>
          <div className="grid grid-cols-2 gap-2">
            {group.slots.map((slot) => {
              const available = slot.available !== false
              const selected = slot.value === value
              return (
                <button
                  key={slot.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!available}
                  onClick={() => onValueChange(slot.value)}
                  className={cn(
                    'flex h-10 cursor-pointer items-center justify-center rounded-lg px-3 text-small font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
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
