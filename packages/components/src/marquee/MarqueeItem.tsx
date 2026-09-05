import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const deltaVariants = cva('micro', {
  variants: {
    trend: {
      up: 'text-success',
      down: 'text-destructive',
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
    <div className={cn('flex items-center gap-2', className)}>
      <span className="micro" data-emphasis="subtlest">
        {label}
      </span>
      <small>{value}</small>
      {delta ? <span className={deltaVariants({ trend })}>{delta}</span> : null}
    </div>
  )
}

export { deltaVariants }
