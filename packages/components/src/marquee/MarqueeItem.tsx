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

export type MarqueeItemProps = VariantProps<typeof deltaVariants> & {
  label: React.ReactNode
  value: React.ReactNode
  delta?: React.ReactNode
  className?: string
}

export function MarqueeItem({ label, value, delta, trend, className }: MarqueeItemProps) {
  return (
    <div className={cn('flex items-center gap-xs', className)}>
      <span className="micro font-medium text-placeholder [--text:var(--color-placeholder)]">
        {label}
      </span>
      <small className="font-medium" data-emphasis="default">
        {value}
      </small>
      {delta ? <span className={deltaVariants({ trend })}>{delta}</span> : null}
    </div>
  )
}

export { deltaVariants }
