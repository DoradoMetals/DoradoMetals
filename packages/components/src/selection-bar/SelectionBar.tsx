'use client'

import * as React from 'react'
import { cva } from 'class-variance-authority'
import { X } from '@dorado/icons'
import { Button } from '../button/Button'
import { cn } from '../cn'

const innerVariants = cva('mx-auto flex w-full max-w-page p-md', {
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
  ref?: React.Ref<HTMLDivElement>
}

export function SelectionBar({
  summary,
  totals,
  actions,
  onDismiss,
  dismissLabel = 'Clear selection',
  layout = 'desktop',
  className,
  ref,
  ...props
}: SelectionBarProps) {
  const dismiss = onDismiss ? (
    <Button
      variant="tertiary"
      size="iconXs"
      className="text-foreground"
      aria-label={dismissLabel}
      onClick={onDismiss}
    >
      <X aria-hidden />
    </Button>
  ) : null
  return (
    <div
      role="region"
      aria-label="Selection"
      data-layout={layout}
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-raised',
        'shadow-[0_calc(-1*var(--floating-y))_var(--floating-blur)_var(--floating-shadow)]',
        className
      )}
      {...props}
    >
      <div className={innerVariants({ layout })}>
        <div className={cn('flex gap-sm', layout === 'mobile' ? 'items-start' : 'items-center')}>
          {dismiss && layout === 'desktop' && dismiss}
          <div className="flex min-w-0 flex-1 flex-col gap-2xs">
            <p className="text-small text-foreground">{summary}</p>
            {totals != null && <p className="truncate text-micro text-subtle">{totals}</p>}
          </div>
          {dismiss && layout === 'mobile' && dismiss}
        </div>
        {actions != null && (
          <div
            className={cn('flex items-center gap-xs', layout === 'mobile' && 'w-full [&>*]:flex-1')}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
