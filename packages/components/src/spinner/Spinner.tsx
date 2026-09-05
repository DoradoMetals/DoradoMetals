import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const spinnerVariants = cva(
  'inline-block animate-spin rounded-full border-secondary border-t-primary motion-reduce:animate-pulse',
  {
    variants: {
      size: {
        sm: 'size-4 border-2',
        md: 'size-6 border-2',
        lg: 'size-10 border-[3px]',
      },
    },
    defaultVariants: { size: 'md' },
  }
)

export type SpinnerProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof spinnerVariants> & { label?: string }

export function Spinner({ className, size, label = 'Loading', ...props }: SpinnerProps) {
  return (
    <span role="status" {...props}>
      <span aria-hidden className={cn(spinnerVariants({ size }), className)} />
      <span className="sr-only">{label}</span>
    </span>
  )
}
