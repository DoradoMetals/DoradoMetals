import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const deltaVariants = cva('micro tabular-nums', {
  variants: {
    trend: {
      up: 'text-success [--text:var(--color-success)]',
      down: 'text-destructive [--text:var(--color-destructive)]',
      flat: '',
    },
  },
  defaultVariants: { trend: 'flat' },
})

export type MarqueeItemProps = VariantProps<typeof deltaVariants> & {
  label: React.ReactNode
  value: React.ReactNode
  move?: React.ReactNode
  delta?: React.ReactNode
  className?: string
}

export function MarqueeItem({ label, value, move, delta, trend, className }: MarqueeItemProps) {
  return (
    <div className={cn('flex items-baseline gap-xs', className)}>
      <span className="micro font-medium text-placeholder [--text:var(--color-placeholder)]">
        {label}
      </span>
      <p className="font-medium tabular-nums" data-emphasis="default">
        {value}
      </p>
      {move || move === 0 || delta || delta === 0 ? (
        <span className="inline-flex items-baseline gap-3xs">
          {move || move === 0 ? <span className={deltaVariants({ trend })}>{move}</span> : null}
          {delta || delta === 0 ? <span className={deltaVariants({ trend })}>{delta}</span> : null}
        </span>
      ) : null}
    </div>
  )
}

export { deltaVariants }
