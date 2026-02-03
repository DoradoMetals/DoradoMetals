'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import {
  CurrencyDollarIcon,
  PercentIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@phosphor-icons/react'
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
      <div className="text-xs font-medium text-neutral-700 pl-1">{label}</div>

      <div className="flex items-center gap-2">
        <RadioGroup
          value={unit}
          onValueChange={(v) => {
            setUnit(v as Unit)
          }}
          className="flex items-center gap-0 rounded-lg p-0"
        >
          <RadioPill
            id={`${label}-unit-dollar`}
            value="dollar"
            groupValue={unit}
            activeClass="primary-on-glass rounded-l-lg"
            inactiveClass="rounded-l-lg on-glass"
          >
            <CurrencyDollarIcon size={18} />
          </RadioPill>

          <RadioPill
            id={`${label}-unit-percent`}
            value="percent"
            groupValue={unit}
            activeClass="primary-on-glass rounded-r-lg"
            inactiveClass="rounded-r-lg on-glass"
          >
            <PercentIcon size={18} />
          </RadioPill>
        </RadioGroup>

        <div className="relative flex-1">
          <Input
            inputMode="decimal"
            type="text"
            className={cn('h-10 text-center hover:on-glass', inputClassName)}
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
          <RadioPill
            id={`${label}-dir-over`}
            value="over"
            groupValue={direction}
            activeClass="rounded-l-lg success-on-glass"
            inactiveClass="rounded-l-lg on-glass"
          >
            <ArrowUpIcon size={18} />
          </RadioPill>


          <RadioPill
            id={`${label}-dir-under`}
            value="under"
            groupValue={direction}
            activeClass="rounded-r-lg destructive-on-glass"
            inactiveClass="rounded-r-lg on-glass"
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
  activeClass,
  inactiveClass,
}: {
  id: string
  value: string
  groupValue: string
  children: any
  activeClass: string
  inactiveClass: string
}) {
  const active = groupValue === value
  return (
    <label
      htmlFor={id}
      className={cn(
        'h-10 px-2 min-w-10 flex items-center justify-center cursor-pointer select-none transition-colors',
        active ? activeClass : inactiveClass
      )}
    >
      <RadioGroupItem id={id} value={value} className="sr-only" />
      {children}
    </label>
  )
}
