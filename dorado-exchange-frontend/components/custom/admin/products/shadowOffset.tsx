'use client'

import { cn } from '@/lib/utils'
import { useMemo } from 'react'

function DotBtn({
  value,
  checked,
  onClick,
  className,
}: {
  value: number
  checked: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'cursor-pointer w-full h-10 rounded-lg border text-sm font-medium raised-off-page',
        'grid place-items-center',
        'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'border-0 liquid-gold text-white' : 'bg-card text-neutral-800 border-1 border-border',
        className
      )}
    >
      {value}
    </button>
  )
}

export default function ShadowOffsetPicker({
  label = 'Shadow Offset',
  value,
  onChange,
  className,
}: {
  label?: string
  value: number
  onChange: (next: number) => void
  className?: string
}) {
  const items = useMemo(() => Array.from({ length: 10 }, (_, i) => i), [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(Math.max(0, value - 1))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.min(9, value + 1))
    }
  }

  return (
    <div className={cn('flex flex-col gap-1 w-full', className)}>
      <div className="text-xs font-medium text-neutral-700 pl-1">{label}</div>

      <div
        role="radiogroup"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="grid grid-cols-5 gap-2 w-full"
      >
        {items.map((n) => (
          <DotBtn key={n} value={n} checked={value === n} onClick={() => onChange(n)} />
        ))}
      </div>
    </div>
  )
}
