'use client'

// Progress — the Figma "Progress" set (132:995): Attachment's upload rail
// promoted to an atom. 6px track, muted fill, full radius (a rail is the one
// sanctioned pill besides chips), primary indicator moved by transform so the
// animation composites. Indeterminate sweeps a fixed segment and drops
// aria-valuenow; the sweep pauses under motion-reduce.
import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '../cn'

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  /** 0–100. Omit (or pass null) for indeterminate. */
  value?: number | null
}

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, ...props }, ref) => {
  const indeterminate = value == null
  return (
    <ProgressPrimitive.Root
      ref={ref}
      // Radix omits aria-valuenow itself when value is null.
      value={indeterminate ? null : value}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      {indeterminate ? (
        <div className="h-full w-1/3 rounded-full bg-primary animate-progress-sweep motion-reduce:animate-none motion-reduce:w-full" />
      ) : (
        <ProgressPrimitive.Indicator
          className="h-full w-full rounded-full bg-primary transition-transform duration-300"
          style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%)` }}
        />
      )}
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = 'Progress'

export { Progress }
