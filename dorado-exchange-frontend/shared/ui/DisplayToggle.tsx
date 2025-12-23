import * as React from 'react'
import { cn } from '@/shared/utils/cn'

function SegBtn({
  checked,
  intent,
  children,
  onClick,
  className,
}: {
  checked: boolean
  intent: 'success' | 'destructive'
  children: React.ReactNode
  onClick: () => void
  className?: string
}) {
  const active = intent === 'success' ? 'bg-success text-white' : 'bg-destructive text-white'
  const inactive = 'bg-card text-neutral-800'

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'cursor-pointer h-10 w-full px-4 text-sm font-medium outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring',
        checked ? active : inactive,
        className
      )}
    >
      {children}
    </button>
  )
}

export function DisplayToggle({
  label,
  value,
  onChange,
  className,
  onLabel = 'Yes',
  offLabel = 'No',
  onIntent = 'success',
  offIntent = 'destructive',
}: {
  label: string
  value: boolean
  onChange: (next: boolean) => void
  className?: string
  onLabel?: string
  offLabel?: string
  onIntent?: 'success' | 'destructive'
  offIntent?: 'success' | 'destructive'
}) {
  return (
    <div className={cn('flex flex-col gap-1 w-full', className)}>
      <div className="text-xs font-medium text-neutral-700 pl-1">{label}</div>

      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-2 w-full rounded-lg overflow-hidden border border-border"
      >
        <SegBtn
          checked={value}
          intent={onIntent}
          onClick={() => onChange(true)}
          className="border-r border-border"
        >
          {onLabel}
        </SegBtn>

        <SegBtn checked={!value} intent={offIntent} onClick={() => onChange(false)}>
          {offLabel}
        </SegBtn>
      </div>
    </div>
  )
}
