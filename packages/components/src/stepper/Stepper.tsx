import * as React from 'react'
import { Check } from '@dorado/icons'
import { cn } from '../cn'

export type StepperProps = {
  steps: number | string[]

  current: number
  className?: string
}

export function Stepper({ steps, current, className }: StepperProps) {
  const labels = typeof steps === 'number' ? Array.from({ length: steps }, () => null) : steps
  const n = labels.length

  return (
    <ol
      aria-label={`Step ${Math.min(current + 1, n)} of ${n}`}
      className={cn('flex w-full items-center gap-xs', className)}
    >
      {labels.map((label, i) => {
        const state = i < current ? 'complete' : i === current ? 'current' : 'upcoming'
        return (
          <React.Fragment key={i}>
            <li
              aria-current={state === 'current' ? 'step' : undefined}
              aria-label={`Step ${i + 1} of ${n}${label ? `: ${label}` : ''}`}
              className={cn(
                'flex min-h-(--control-xs) min-w-(--control-xs) shrink-0 items-center justify-center rounded-full text-micro font-medium',
                state === 'upcoming'
                  ? 'border border-border bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground'
              )}
            >
              {state === 'complete' ? (
                <Check aria-hidden className="size-sm-plus" strokeWidth={(2 * 14) / 24} />
              ) : (
                i + 1
              )}
            </li>
            {i < n - 1 && (
              <span
                aria-hidden
                className={cn(
                  'h-3xs min-w-2xs flex-1 rounded-full',
                  i < current ? 'bg-primary' : 'bg-border-strong'
                )}
              />
            )}
          </React.Fragment>
        )
      })}
    </ol>
  )
}
