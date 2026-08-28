'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { RadioGroup } from '@/shared/ui/base/radio-group'
import { RadioCard } from '@/shared/ui/RadioCard'
import {
  CurrencyDollarIcon,
  PercentIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@phosphor-icons/react'
import { Input } from '@/shared/ui/base/input'
import { Label } from '@/shared/ui/base/label'

type Unit = 'dollar' | 'percent'
type Direction = 'over' | 'under'

export interface PremiumControlProps {
  label: string
  value: number
  onChange: (multiplier: number) => void
  spotPerOz: number
  contentOz: number
  className?: string
  inputClassName?: string
}

const clamp = (n: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(max, Math.max(min, n))

const round = (n: number, dp = 4) => {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

function parseNum(s: string) {
  if (s.trim() === '') return NaN
  const n = Number(s.replace(/,/g, ''))
  return isFinite(n) ? n : NaN
}

function formatByUnit(percentAbs: number, dollarAbs: number, u: Unit) {
  const n = u === 'percent' ? percentAbs : dollarAbs
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

function percentAbsFromInput(input: string, unit: Unit, spotPerOz: number, contentOz: number) {
  const raw = parseNum(input)
  if (isNaN(raw)) return 0

  if (unit === 'percent') return clamp(raw, 0, 1000)

  const denom = spotPerOz * contentOz
  const pct = denom > 0 ? (raw / denom) * 100 : 0
  return clamp(pct, 0, 1000)
}

function multiplierFrom(percentAbs: number, direction: Direction) {
  return direction === 'over' ? 1 + percentAbs / 100 : 1 - percentAbs / 100
}

export default function PremiumControl({
  label,
  value,
  onChange,
  spotPerOz,
  contentOz,
  className,
  inputClassName,
}: PremiumControlProps) {
  const initialDirection: Direction = value >= 1 ? 'over' : 'under'
  const initialPercentAbs = Math.abs(value - 1) * 100
  const initialDollarAbs = (initialPercentAbs / 100) * spotPerOz * contentOz

  const [unit, setUnit] = useState<Unit>('percent')
  const [direction, setDirection] = useState<Direction>(initialDirection)
  const [input, setInput] = useState<string>(() =>
    formatByUnit(initialPercentAbs, initialDollarAbs, 'percent')
  )

  useEffect(() => {
    const pct = percentAbsFromInput(input, unit, spotPerOz, contentOz)
    const dollars = (pct / 100) * spotPerOz * contentOz
    setInput(formatByUnit(pct, dollars, unit))
  }, [unit, spotPerOz, contentOz])

  const display = useMemo(
    () => (input === '' ? '' : unit === 'dollar' ? `$${input}` : `${input}%`),
    [unit, input]
  )

  function commit(nextInput: string, nextDirection: Direction) {
    const pct = percentAbsFromInput(nextInput, unit, spotPerOz, contentOz)
    onChange(round(multiplierFrom(pct, nextDirection)))
  }

  return (
    <div className={cn('flex flex-col w-full gap-1', className)}>
      <Label className="pl-1">{label}</Label>

      <div className="flex items-center gap-2">
        <RadioGroup
          value={unit}
          onValueChange={(v) => {
            setUnit(v as Unit)
          }}
          className="flex items-center gap-0 rounded-lg p-0"
        >
          {/* `rounded-l-lg` / `rounded-r-lg` are the JOINED-END geometry of a
              two-cell segmented control, not a look: RadioCard's `segment` has
              no expression for "this cell is an end cap", so the two survive at
              the call site. Flagged in the report as the one real gap.
              The unit pair is `intent="neutral"`, which FILLS rather than
              washing - the old `bg-primary/15` was a 15% white wash on a
              near-black ground, i.e. a selected state nobody could see. */}
          <RadioCard
            id={`${label}-unit-dollar`}
            value="dollar"
            variant="segment"
            className="h-10 min-w-10 px-2 rounded-l-lg"
          >
            <CurrencyDollarIcon size={18} />
          </RadioCard>

          <RadioCard
            id={`${label}-unit-percent`}
            value="percent"
            variant="segment"
            className="h-10 min-w-10 px-2 rounded-r-lg"
          >
            <PercentIcon size={18} />
          </RadioCard>
        </RadioGroup>

        <div className="relative flex-1">
          <Input
            inputMode="decimal"
            type="text"
            className={cn('h-10 text-center', inputClassName)}
            value={display}
            onChange={(e) => {
              const cleaned = e.target.value
                .replace(/[$%]/g, '')
                .replace(/[^\d.]/g, '')
                .replace(/(\..*)\./g, '$1')
              setInput(cleaned)
              commit(cleaned, direction)
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
              const pct = percentAbsFromInput(input, unit, spotPerOz, contentOz)
              const dollars = (pct / 100) * spotPerOz * contentOz
              const formatted = formatByUnit(pct, dollars, unit)
              setInput(formatted)
              commit(formatted, direction)
            }}
            placeholder={unit === 'dollar' ? '$' : '%'}
          />
        </div>

        <RadioGroup
          value={direction}
          onValueChange={(v) => {
            const next = v as Direction
            setDirection(next)
            commit(input, next)
          }}
          className="flex items-center gap-0 rounded-lg p-0"
        >
          <RadioCard
            id={`${label}-dir-over`}
            value="over"
            variant="segment"
            intent="success"
            className="h-10 min-w-10 px-2 rounded-l-lg"
          >
            <ArrowUpIcon size={18} />
          </RadioCard>

          <RadioCard
            id={`${label}-dir-under`}
            value="under"
            variant="segment"
            intent="danger"
            className="h-10 min-w-10 px-2 rounded-r-lg"
          >
            <ArrowDownIcon size={18} />
          </RadioCard>
        </RadioGroup>
      </div>
    </div>
  )
}


