'use client'

import * as React from 'react'
import { CalendarArrowDown } from '@dorado/icons'

import { Button } from '../button/Button'
import { cn } from '../cn'
import { FieldLabel } from '../field/Field'
import { Calendar } from './Calendar'

export type DateRange = { from: Date | undefined; to?: Date | undefined }

export type DateRangePickerProps = {
  label?: React.ReactNode
  value: DateRange | undefined
  onValueChange: (value: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
  defaultMonth?: Date
  className?: string
}

const md = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// 1208:633 reads "Oct 1 – Oct 19, 2026": the year once, at the end; both
// years when the range crosses one.
export function formatRange(range: DateRange | undefined): string | null {
  if (!range?.from) return null
  const to = range.to ?? range.from
  const fromYear = range.from.getFullYear()
  const toYear = to.getFullYear()
  if (to.getTime() === range.from.getTime()) return `${md(to)}, ${toYear}`
  return fromYear === toYear
    ? `${md(range.from)} – ${md(to)}, ${toYear}`
    : `${md(range.from)}, ${fromYear} – ${md(to)}, ${toYear}`
}

// Date Picker 1208:898 (2026-10-19): label above; a control of the calendar
// segment, a border-strong hairline and the value, no chevron. Opens the Date
// Range Panel 1208:385: the Calendar in range mode, then Clear and Apply (no
// presets). In-range days on surface highest, the ends white with dark text,
// today outlined. States Default ("Any time"), Filled, Open, Disabled.
export function DateRangePicker({
  label,
  value,
  onValueChange,
  placeholder = 'Any time',
  disabled = false,
  defaultMonth,
  className,
}: DateRangePickerProps) {
  const id = React.useId()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<DateRange | undefined>(value)
  const shown = open && !disabled
  const text = formatRange(value)

  React.useEffect(() => {
    if (!shown) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [shown])

  // Focus enters the panel on the selected start day, else today, else the
  // first day; closing returns it to the trigger.
  React.useEffect(() => {
    if (!shown || !panelRef.current) return
    const panel = panelRef.current
    const target =
      panel.querySelector<HTMLButtonElement>('[data-range-start] button, [data-selected] button') ??
      panel.querySelector<HTMLButtonElement>('[data-today] button') ??
      panel.querySelector<HTMLButtonElement>('[data-day] button') ??
      panel
    target.focus()
  }, [shown])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const toggle = () => {
    if (!open) setDraft(value)
    setOpen(!open)
  }

  return (
    <div
      ref={rootRef}
      className={cn('relative flex w-full flex-col gap-3xs', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && shown) close()
      }}
    >
      {label != null && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={shown}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          'flex min-h-(--control-lg) w-full cursor-pointer items-stretch overflow-hidden rounded-lg border border-border text-left',
          'focus-visible:outline-none focus-visible:border-primary disabled:pointer-events-none'
        )}
      >
        <span
          aria-hidden
          data-part="calendar-segment"
          className={cn(
            'flex w-(--control-lg) shrink-0 items-center justify-center text-foreground',
            disabled ? 'bg-muted text-muted-foreground' : 'bg-card'
          )}
        >
          <CalendarArrowDown className="size-4" />
        </span>
        <span aria-hidden data-part="divider" className="w-px shrink-0 bg-border-strong" />
        <span
          data-part="value"
          className={cn(
            'flex min-w-0 flex-1 items-center truncate px-sm text-body',
            disabled ? 'bg-muted text-muted-foreground' : 'bg-card text-foreground'
          )}
        >
          {text ?? placeholder}
        </span>
      </button>
      {shown && (
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={id}
          tabIndex={-1}
          className="absolute left-0 top-full z-50 mt-xs flex w-fit flex-col gap-sm rounded-lg border border-border bg-card p-md"
        >
          <Calendar
            mode="range"
            selected={draft}
            onSelect={(next) => setDraft(next)}
            defaultMonth={draft?.from ?? defaultMonth}
            weekStartsOn={1}
            classNames={{
              selected: '',
              range_start:
                '[&>button]:bg-primary [&>button]:font-medium [&>button]:text-primary-foreground [&>button:hover]:bg-primary',
              range_end:
                '[&>button]:bg-primary [&>button]:font-medium [&>button]:text-primary-foreground [&>button:hover]:bg-primary',
              range_middle: 'rounded-sm bg-highest',
            }}
          />
          <div className="flex items-center justify-end gap-xs">
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => {
                setDraft(undefined)
                onValueChange(undefined)
                close()
              }}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onValueChange(draft?.from ? draft : undefined)
                close()
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
