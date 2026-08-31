'use client'

// Quantity Stepper — the Figma set (132:1016): the cart's busiest control,
// promoted from hand-rolled +/− buttons. One bordered group in the Field
// chassis language at 36px. The value is a REAL input — click to type,
// arrows step, blur clamps — and at the floor the decrement DISABLES rather
// than removes: reaching zero is the Remove action's job, not this control's.
import * as React from 'react'
import { Minus, Plus } from 'lucide-react'

import { cn } from '../cn'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
  className?: string
  /** Accessible name for the group, e.g. the line item it counts. */
  label?: string
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

const QuantityStepper = React.forwardRef<HTMLDivElement, QuantityStepperProps>(
  ({ value, onChange, min = 1, max = 99, disabled, className, label }, ref) => {
    // Free text while typing; committed (clamped) on blur or Enter.
    const [draft, setDraft] = React.useState<string | null>(null)

    const commit = (raw: string) => {
      setDraft(null)
      const parsed = Number.parseInt(raw, 10)
      if (Number.isNaN(parsed)) return // revert to the last real value
      const next = clamp(parsed, min, max)
      if (next !== value) onChange(next)
    }
    const step = (delta: number) => {
      const next = clamp(value + delta, min, max)
      if (next !== value) onChange(next)
    }

    return (
      <div
        ref={ref}
        role="group"
        aria-label={label ?? 'Quantity'}
        className={cn(
          // focus-within: the whole group's border goes PRIMARY - the field focus
          // language - which is how "the middle is an input" announces itself
          // (Jacob, 2026-08-30). cursor-text on the value does the rest.
          'inline-flex h-9 items-center overflow-hidden rounded-lg border border-input bg-card transition-colors focus-within:border-primary',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
      >
        <button
          type="button"
          aria-label="Decrease quantity"
          disabled={disabled || value <= min}
          onClick={() => step(-1)}
          className="flex h-full w-8 items-center justify-center text-muted-foreground outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-40"
        >
          <Minus className="size-3.5" aria-hidden />
        </button>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={label ? `${label} quantity` : 'Quantity'}
          disabled={disabled}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={(e) => commit(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
            if (e.key === 'ArrowUp') { e.preventDefault(); step(1) }
            if (e.key === 'ArrowDown') { e.preventDefault(); step(-1) }
          }}
          className="h-full w-8 cursor-text bg-transparent text-center text-sm font-medium tabular-nums text-foreground outline-none"
        />
        <button
          type="button"
          aria-label="Increase quantity"
          disabled={disabled || value >= max}
          onClick={() => step(1)}
          className="flex h-full w-8 items-center justify-center text-muted-foreground outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
    )
  },
)
QuantityStepper.displayName = 'QuantityStepper'

export { QuantityStepper }
