'use client'
import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '../cn'

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value: number
  showValue?: boolean
}

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, showValue = false, ...props }, ref) => {
  const clamped = Math.min(100, Math.max(0, value))
  const bar = (
    <ProgressPrimitive.Root
      ref={ref}
      value={clamped}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full rounded-full bg-primary transition-transform duration-300 motion-reduce:transition-none"
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  )
  if (!showValue) return bar
  return (
    <span className="flex w-full items-center gap-2.5">
      {bar}
      <span aria-hidden className="shrink-0 text-micro tabular-nums text-placeholder">
        {Math.round(clamped)}%
      </span>
    </span>
  )
})
Progress.displayName = 'Progress'

export { Progress }
