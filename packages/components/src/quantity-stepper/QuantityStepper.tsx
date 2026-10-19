'use client'

import * as React from 'react'
import { Minus, Plus } from '@dorado/icons'

import { cn } from '../cn'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
  className?: string
  label?: string
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

const QuantityStepper = React.forwardRef<HTMLDivElement, QuantityStepperProps>(
  ({ value, onChange, min = 1, max = 99, disabled, className, label }, ref) => {
    const [draft, setDraft] = React.useState<string | null>(null)
    const atMin = value <= min
    const atMax = value >= max

    const commit = (raw: string) => {
      setDraft(null)
      const parsed = Number.parseInt(raw, 10)
      if (Number.isNaN(parsed)) return
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
          'inline-flex min-h-(--control-sm-plus) items-center overflow-hidden rounded-lg border border-border bg-card transition-colors focus-within:border-primary',
          disabled && 'pointer-events-none opacity-50',
          className
        )}
      >
        <button
          type="button"
          aria-label="Decrease quantity"
          disabled={disabled || atMin}
          onClick={() => step(-1)}
          className={cn(
            'flex w-(--control-sm) self-stretch items-center justify-center text-muted-foreground outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none',
            !disabled && atMin && 'opacity-40'
          )}
        >
          <Minus className="size-3.5" aria-hidden />
        </button>
        <input
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
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
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              step(1)
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              step(-1)
            }
            if (e.key === 'Home') {
              e.preventDefault()
              if (value !== min) onChange(min)
            }
            if (e.key === 'End') {
              e.preventDefault()
              if (value !== max) onChange(max)
            }
          }}
          className="w-7 self-stretch cursor-text bg-transparent text-center text-small font-medium tabular-nums text-foreground outline-none disabled:text-foreground-disabled"
        />
        <button
          type="button"
          aria-label="Increase quantity"
          disabled={disabled || atMax}
          onClick={() => step(1)}
          className={cn(
            'flex w-(--control-sm) self-stretch items-center justify-center text-muted-foreground outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none',
            !disabled && atMax && 'opacity-40'
          )}
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
    )
  }
)
QuantityStepper.displayName = 'QuantityStepper'

export { QuantityStepper }
