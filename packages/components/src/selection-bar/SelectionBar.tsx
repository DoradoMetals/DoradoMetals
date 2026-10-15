'use client'

import * as React from 'react'
import { cva } from 'class-variance-authority'
import { X } from '@dorado/icons'
import { Button } from '../button/Button'
import { cn } from '../cn'

const barVariants = cva('flex rounded-lg border border-border bg-card p-md', {
  variants: {
    layout: {
      desktop: 'items-center justify-between gap-lg',
      mobile: 'flex-col items-stretch gap-sm',
    },
  },
  defaultVariants: { layout: 'desktop' },
})

export type SelectionBarProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  summary: React.ReactNode
  totals?: React.ReactNode
  actions?: React.ReactNode
  onDismiss?: () => void
  dismissLabel?: string
  layout?: 'desktop' | 'mobile'
}

export function SelectionBar({
  summary,
  totals,
  actions,
  onDismiss,
  dismissLabel = 'Clear selection',
  layout = 'desktop',
  className,
  ...props
}: SelectionBarProps) {
  return (
    <div
      role="region"
      aria-label="Selection"
      data-layout={layout}
      className={cn(barVariants({ layout }), className)}
      {...props}
    >
      <div className="flex items-center gap-sm">
        {onDismiss && (
          <Button
            variant="tertiary"
            size="iconXs"
            className="text-foreground"
            aria-label={dismissLabel}
            onClick={onDismiss}
          >
            <X aria-hidden />
          </Button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2xs">
          <p className="text-small text-foreground">{summary}</p>
          {totals != null && <p className="truncate text-micro text-subtle">{totals}</p>}
        </div>
      </div>
      {actions != null && (
        <div
          className={cn('flex items-center gap-xs', layout === 'mobile' && 'w-full [&>*]:flex-1')}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
