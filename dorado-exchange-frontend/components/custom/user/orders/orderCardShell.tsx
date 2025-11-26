'use client'

import { ReactNode, KeyboardEvent } from 'react'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { cn } from '@/lib/utils'

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
  statusTextClassName = 'text-lg text-neutral-800',
  total,
  totalTextClassName = 'text-lg text-neutral-800',
  secondaryInfo,
  secondaryTextClassName = 'text-sm text-neutral-700',
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
        'flex flex-col w-full bg-card rounded-lg p-4 raised-off-page h-auto',
        'cursor-pointer outline-none',
        'transition-shadow transition-colors duration-150',
        'hover:shadow-md hover:bg-highest'
      )}
    >
      <div className="border-b border-border mb-3">
        <div className="flex items-center justify-between w-full pb-4">
          <div className="text-sm text-neutral-600">{createdAtLabel}</div>
          <div className="text-sm text-neutral-600 tracking-wide">{orderNumberLabel}</div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between w-full gap-4">
          <div className="flex items-center gap-2">
            {StatusIcon && <StatusIcon size={24} className={statusIconClassName} />}
            <span className={statusTextClassName}>{statusLabel}</span>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className={totalTextClassName}>
              <PriceNumberFlow value={total} />
            </div>
            {secondaryInfo && (
              <div className={secondaryTextClassName}>
                {secondaryInfo}
              </div>
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
