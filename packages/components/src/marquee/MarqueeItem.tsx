import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const deltaVariants = cva('micro', {
  variants: {
    trend: {
      up: 'text-success [--text:var(--color-success)]',
      down: 'text-destructive [--text:var(--color-destructive)]',
      flat: '',
    },
  },
  defaultVariants: { trend: 'flat' },
})

const FIGURE_LABEL = 'micro font-medium text-placeholder [--text:var(--color-placeholder)]'

export type MarqueeItemProps = VariantProps<typeof deltaVariants> & {
  label: React.ReactNode
  value: React.ReactNode
  ask?: React.ReactNode
  delta?: React.ReactNode
  className?: string
}

export function MarqueeItem({ label, value, ask, delta, trend, className }: MarqueeItemProps) {
  return (
    <div className={cn('flex items-center gap-xs', className)}>
      <span className="micro font-medium text-placeholder [--text:var(--color-placeholder)]">
        {label}
      </span>
      {ask != null && <span className={FIGURE_LABEL}>Bid</span>}
      <small className="font-medium" data-emphasis="default">
        {value}
      </small>
      {ask != null && (
        <>
          <span className={FIGURE_LABEL}>Ask</span>
          <small className="font-medium" data-emphasis="subtlest">
            {ask}
          </small>
        </>
      )}
      {delta ? <span className={deltaVariants({ trend })}>{delta}</span> : null}
    </div>
  )
}

export { deltaVariants }
