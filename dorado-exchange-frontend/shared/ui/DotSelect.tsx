'use client'

import { cn } from '@/shared/utils/cn'
import { useMemo } from 'react'

function DotBtn({
  label,
  checked,
  onClick,
  buttonClass = 'h-10 rounded-lg border text-sm font-medium raised-off-page',
  checkedClass = 'border-0 bg-primary text-white',
  defaultClass = 'bg-highest text-neutral-800 border-1 border-border',
}: {
  label: React.ReactNode
  checked: boolean
  onClick: () => void
  buttonClass?: string
  checkedClass?: string
  defaultClass?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'w-full cursor-pointer grid place-items-center transition-colors outline-none',
        buttonClass,
        checked ? checkedClass : defaultClass
      )}
    >
      {label}
    </button>
  )
}

export default function DotSelect({
  label,
  count,
  value,
  onChange,
  className,
  buttonClass,
  checkedClass,
  defaultClass,
  getLabel,
}: {
  label: string
  count: number
  value: number
  onChange: (next: number) => void
  className?: string
  buttonClass?: string
  checkedClass?: string
  defaultClass?: string
  getLabel?: (index: number) => React.ReactNode
}) {
  const items = useMemo(() => Array.from({ length: Math.max(0, count) }, (_, i) => i), [count])
  const max = Math.max(0, count - 1)

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (count <= 0) return

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(Math.max(0, value - 1))
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(Math.min(max, value + 1))
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
          <DotBtn
            key={n}
            label={getLabel ? getLabel(n) : n}
            checked={value === n}
            onClick={() => onChange(n)}
            buttonClass={buttonClass}
            checkedClass={checkedClass}
            defaultClass={defaultClass}
          />
        ))}
      </div>
    </div>
  )
}
