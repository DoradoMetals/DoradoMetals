'use client'

import { ReactNode, KeyboardEvent } from 'react'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { cn } from '@/shared/utils/cn'

type OrderCardShellProps = {
  createdAtLabel: string
  orderNumberLabel: string
  statusLabel: string
  StatusIcon?: React.ComponentType<{ size?: number; className?: string }>
  statusIconClassName?: string
  statusTextClassName?: string
  total: number
  totalTextClassName?: string
  secondaryInfo?: string
  secondaryTextClassName?: string
  rightContent?: ReactNode
  downloadArea?: ReactNode
  onOpen: () => void
}

export function OrderCardShell({
  createdAtLabel,
  orderNumberLabel,
  statusLabel,
  StatusIcon,
  statusIconClassName = 'text-primary',
  statusTextClassName,
  total,
  totalTextClassName,
  secondaryInfo,
  secondaryTextClassName,
  rightContent,
  downloadArea,
  onOpen,
}: OrderCardShellProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex flex-col w-full bg-card rounded-lg border border-border p-4 h-auto',
        'cursor-pointer outline-none',
        'transition-colors duration-150',
        // The hover was a shadow plus a surface step; the shadow goes (ruling 27)
        // and the hairline strengthens instead, which is the ruling-19 idiom.
        'hover:border-border-strong hover:bg-highest'
      )}
    >
      <div className="border-b border-border mb-3">
        <div className="flex items-center justify-between w-full pb-4">
          <small>{createdAtLabel}</small>
          <small className="tracking-wide">{orderNumberLabel}</small>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between w-full gap-4">
          <div className="flex items-center gap-2">
            {StatusIcon && <StatusIcon size={24} className={statusIconClassName} />}
            <strong className={cn('stat-sm', statusTextClassName)}>{statusLabel}</strong>
          </div>

          <div className="flex flex-col items-end gap-1">
            <strong className={cn('stat-sm', totalTextClassName)}>
              <PriceNumberFlow value={total} />
            </strong>
            {secondaryInfo && (
              <small data-emphasis="subtle" className={secondaryTextClassName}>
                {secondaryInfo}
              </small>
            )}
          </div>
        </div>

        {(downloadArea || rightContent) && (
          <div className="flex items-end justify-between w-full pt-2">
            <div className="flex flex-col gap-1 items-start">
              {downloadArea}
            </div>
            {rightContent && (
              <div className="flex items-center justify-end">
                {rightContent}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
