'use client'

import * as React from 'react'
import { ChevronDown } from '@dorado/icons'

import { Badge } from '../badge/Badge'
import { Button } from '../button/Button'
import { Checkbox } from '../checkbox/Checkbox'
import { cn } from '../cn'
import { FieldLabel, fieldPanel, fieldTrigger } from '../field/Field'
import { Spinner } from '../spinner/Spinner'
import { rovingKeyDown } from '../hooks/roving'

export type MultiselectItem = { value: string; label: React.ReactNode; disabled?: boolean }

export type MultiselectProps = {
  label?: React.ReactNode
  /** The trigger text (the Library's Value), e.g. "Columns" or "All statuses". */
  placeholder: string
  items: MultiselectItem[]
  value: string[]
  onValueChange: (value: string[]) => void
  showCount?: boolean
  disabled?: boolean
  loading?: boolean
  className?: string
}

// Multiselect 1183:127: a select that holds several values. The trigger shows
// its text and a count badge; open, a checkbox list with Select all and Clear.
// States Default, Open, Disabled, Loading.
export function Multiselect({
  label,
  placeholder,
  items,
  value,
  onValueChange,
  showCount = true,
  disabled = false,
  loading = false,
  className,
}: MultiselectProps) {
  const id = React.useId()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const firstRef = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const [stop, setStop] = React.useState(0)
  const shown = open && !disabled && !loading

  React.useEffect(() => {
    if (!shown) return
    setStop(0)
    firstRef.current?.focus()
  }, [shown])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  React.useEffect(() => {
    if (!shown) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [shown])

  const enabled = items.filter((item) => !item.disabled).map((item) => item.value)
  const chosen = new Set(value)
  const all = enabled.length > 0 && enabled.every((v) => chosen.has(v))
  const some = !all && enabled.some((v) => chosen.has(v))

  const toggle = (next: string, on: boolean) =>
    onValueChange(on ? [...value.filter((v) => v !== next), next] : value.filter((v) => v !== next))

  return (
    <div
      ref={rootRef}
      className={cn('relative flex w-full flex-col gap-3xs', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && shown) {
          event.stopPropagation()
          close()
        }
      }}
    >
      {label != null && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="true"
        aria-expanded={shown}
        aria-controls={shown ? `${id}-panel` : undefined}
        aria-busy={loading || undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(fieldTrigger(), 'cursor-pointer text-left')}
      >
        {loading ? (
          <>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">Loading…</span>
            <Spinner size="sm" />
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{placeholder}</span>
            {showCount && value.length > 0 && <Badge>{value.length} selected</Badge>}
            <ChevronDown
              aria-hidden
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                shown && 'rotate-180'
              )}
            />
          </>
        )}
      </button>
      {shown && (
        <div
          id={`${id}-panel`}
          role="group"
          aria-labelledby={id}
          onKeyDown={rovingKeyDown('[role="checkbox"]', { orientation: 'vertical' })}
          onFocus={(event) => {
            const boxes = Array.from(event.currentTarget.querySelectorAll('[role="checkbox"]'))
            const index = boxes.indexOf(event.target)
            if (index !== -1) setStop(index)
          }}
          className={cn(fieldPanel(), 'absolute left-0 top-full mt-3xs w-full gap-3xs')}
        >
          <div className="flex items-center justify-between px-xs py-2xs">
            <label className="flex cursor-pointer items-center gap-xs text-small font-medium text-foreground">
              <Checkbox
                ref={firstRef}
                tabIndex={stop === 0 ? 0 : -1}
                aria-label="Select all"
                checked={all ? true : some ? 'indeterminate' : false}
                onCheckedChange={(next) =>
                  onValueChange(next === true ? [...new Set([...value, ...enabled])] : [])
                }
              />
              Select all
            </label>
            <Button variant="tertiary" size="sm" onClick={() => onValueChange([])}>
              Clear
            </Button>
          </div>
          {items.map((item, index) => (
            <label
              key={item.value}
              className="flex cursor-pointer items-center gap-xs px-xs py-2xs text-body text-foreground"
            >
              <Checkbox
                aria-label={typeof item.label === 'string' ? item.label : item.value}
                tabIndex={stop === index + 1 ? 0 : -1}
                checked={chosen.has(item.value)}
                disabled={item.disabled}
                onCheckedChange={(next) => toggle(item.value, next === true)}
              />
              {item.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
