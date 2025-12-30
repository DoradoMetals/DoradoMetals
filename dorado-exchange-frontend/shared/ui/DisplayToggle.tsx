import * as React from 'react'
import { cn } from '@/shared/utils/cn'

function SegBtn({
  checked,
  children,
  onClick,
  className,
}: {
  checked: boolean
  children: React.ReactNode
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
        'cursor-pointer h-10 w-full px-4 text-sm font-medium transition-colors',
        className
      )}
    >
      {children}
    </button>
  )
}

export function  DisplayToggle({
  label,
  value,
  onChange,
  className,
  onLabel = 'Yes',
  offLabel = 'No',
  onClass = 'bg-success text-white',
  offClass = 'bg-destructive text-white',
  inactiveClass = 'bg-highest text-neutral-800',
  groupClassName,
  seamFixClassName,
}: {
  label: string
  value: boolean
  onChange: (next: boolean) => void
  className?: string

  onLabel?: string
  offLabel?: string

  onClass?: string
  offClass?: string
  inactiveClass?: string

  groupClassName?: string
  seamFixClassName?: string
}) {
  const leftClass = value ? onClass : inactiveClass
  const rightClass = !value ? offClass : inactiveClass

  return (
    <div className={cn('flex flex-col gap-1 w-full', className)}>
      <div className="text-xs font-medium text-neutral-700 pl-1">{label}</div>

      <div
        role="radiogroup"
        aria-label={label}
        className={cn('grid grid-cols-2 w-full overflow-hidden', groupClassName)}
      >
        <SegBtn
          checked={value}
          onClick={() => onChange(true)}
          className={cn('rounded-l-lg', leftClass)}
        >
          {onLabel}
        </SegBtn>

        <SegBtn
          checked={!value}
          onClick={() => onChange(false)}
          className={cn('rounded-r-lg', rightClass, seamFixClassName)}
        >
          {offLabel}
        </SegBtn>
      </div>
    </div>
  )
}
