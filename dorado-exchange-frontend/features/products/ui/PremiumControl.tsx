'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import { CurrencyDollarIcon, PercentIcon, ArrowUpIcon, ArrowDownIcon } from '@phosphor-icons/react'
import { Input } from '@/shared/ui/base/input'

type Unit = 'dollar' | 'percent'
type Direction = 'over' | 'under'

export interface PremiumControlProps {
  label: string
  value: number
  onChange: (multiplier: number) => void
  spotPerOz: number
  contentOz: number
  className?: string
}

const clamp = (n: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(max, Math.max(min, n))

const round = (n: number, dp = 4) => {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

export default function PremiumControl({
  label,
  value,
  onChange,
  spotPerOz,
  contentOz,
  className,
}: PremiumControlProps) {
  const initialDirection: Direction = value >= 1 ? 'over' : 'under'
  const initialPercentAbs = Math.abs(value - 1) * 100
  const initialDollarAbs = (initialPercentAbs / 100) * spotPerOz * contentOz

  const [unit, setUnit] = React.useState<Unit>('percent')
  const [direction, setDirection] = React.useState<Direction>(initialDirection)
  const [input, setInput] = React.useState<string>(() =>
    formatByUnit(initialPercentAbs, initialDollarAbs, 'percent')
  )

  React.useEffect(() => {
    const percentAbs = getPercentAbsFromCurrentInput()
    const dollarAbs = (percentAbs / 100) * spotPerOz * contentOz
    setInput(formatByUnit(percentAbs, dollarAbs, unit))
  }, [unit, spotPerOz, contentOz])

  React.useEffect(() => {
    const percentAbs = getPercentAbsFromCurrentInput()
    const multiplier = direction === 'over' ? 1 + percentAbs / 100 : 1 - percentAbs / 100

    onChange(round(multiplier))
  }, [input, direction])

  function parseNum(s: string) {
    if (s.trim() === '') return NaN
    const n = Number(s.replace(/,/g, ''))
    return isFinite(n) ? n : NaN
  }

  function getPercentAbsFromCurrentInput(): number {
    const raw = parseNum(input)
    if (isNaN(raw)) return 0

    if (unit === 'percent') {
      return clamp(raw, 0, 1000)
    }
    const denom = spotPerOz * contentOz
    const pct = denom > 0 ? (raw / denom) * 100 : 0
    return clamp(pct, 0, 1000)
  }

  function formatByUnit(percentAbs: number, dollarAbs: number, u: Unit) {
    const n = u === 'percent' ? percentAbs : dollarAbs
    return Number.isFinite(n) ? n.toFixed(2) : ''
  }

  const display = React.useMemo(
    () => (input === '' ? '' : unit === 'dollar' ? `$${input}` : `${input}%`),
    [unit, input]
  )
  return (
    <div className={cn('flex flex-col w-full gap-1', className)}>
      <div className="text-xs font-medium text-neutral-700 pl-1">{label}</div>

      <div className="flex items-center gap-2">
        <RadioGroup
          value={unit}
          onValueChange={(v) => setUnit(v as Unit)}
          className="flex items-center gap-0 raised-off-page rounded-lg"
        >
          <RadioPill
            id={`${label}-unit-dollar`}
            value="dollar"
            groupValue={unit}
            className="border-0 rounded-none rounded-l-lg"
            ariaLabel="Dollar input"
            activeClassName="bg-primary text-white"
          >
            <CurrencyDollarIcon size={18} />
          </RadioPill>
          <RadioPill
            id={`${label}-unit-percent`}
            value="percent"
            groupValue={unit}
            className="rounded-none rounded-r-lg"
            ariaLabel="Percent input"
            activeClassName="bg-primary text-white"
          >
            <PercentIcon size={18} />
          </RadioPill>
        </RadioGroup>

        <div className="relative flex-1">
          <Input
            inputMode="decimal"
            type="text"
            className="input-floating-label-form h-10 text-center"
            value={display}
            onChange={(e) => {
              const cleaned = e.target.value
                .replace(/[$%]/g, '')
                .replace(/[^\d.]/g, '')
                .replace(/(\..*)\./g, '$1')
              setInput(cleaned)
            }}
            onFocus={(e) => {
              requestAnimationFrame(() => {
                const el = e.target as HTMLInputElement
                const len = el.value.length
                if (unit === 'dollar') {
                  const pos = Math.max(1, len)
                  el.setSelectionRange(pos, pos)
                } else {
                  const pos = Math.max(0, len - 1)
                  el.setSelectionRange(pos, pos)
                }
              })
            }}
            onBlur={() => {
              const pct = getPercentAbsFromCurrentInput()
              const dollars = (pct / 100) * spotPerOz * contentOz
              setInput(formatByUnit(pct, dollars, unit))
            }}
            placeholder={unit === 'dollar' ? '$' : '%'}
          />
        </div>

        <RadioGroup
          value={direction}
          onValueChange={(v) => setDirection(v as Direction)}
          className="flex items-center gap-0 raised-off-page rounded-lg"
        >
          <RadioPill
            id={`${label}-dir-over`}
            value="over"
            groupValue={direction}
            ariaLabel="Over spot"
            intent="success"
            className="border-0 rounded-none rounded-l-lg"
          >
            <ArrowUpIcon size={18} />
          </RadioPill>
          <RadioPill
            id={`${label}-dir-under`}
            value="under"
            groupValue={direction}
            ariaLabel="Under spot"
            intent="destructive"
            className="border-0 rounded-none rounded-r-lg"
          >
            <ArrowDownIcon size={18} />
          </RadioPill>
        </RadioGroup>
      </div>
    </div>
  )
}

function RadioPill({
  id,
  value,
  groupValue,
  children,
  className,
  ariaLabel,
  intent,
  activeClassName,
}: {
  id: string
  value: string
  groupValue: string
  children: React.ReactNode
  className?: string
  ariaLabel?: string
  intent?: 'success' | 'destructive'
  activeClassName?: string
}) {
  const active = groupValue === value
  const intentClasses =
    intent === 'success'
      ? active
        ? 'bg-success/20 text-success border-success'
        : 'bg-card text-neutral-800 border-border'
      : intent === 'destructive'
      ? active
        ? 'bg-destructive/20 text-destructive border-destructive'
        : 'bg-card text-neutral-800 border-border'
      : active
      ? 'bg-card text-neutral-900 border-primary'
      : 'bg-card text-neutral-800 border-border'

  return (
    <label
      htmlFor={id}
      aria-label={ariaLabel}
      className={cn(
        'h-10 px-2 inline-flex items-center justify-center border rounded-lg cursor-pointer select-none',
        'min-w-10',
        intentClasses,
        active && activeClassName,
        className
      )}
    >
      <RadioGroupItem id={id} value={value} className="sr-only" />
      {children}
    </label>
  )
}
