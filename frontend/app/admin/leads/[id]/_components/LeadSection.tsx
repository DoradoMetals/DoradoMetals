import * as React from 'react'
import { Accordion, Alert, Button, Skeleton, cn } from '@dorado/components'

export type LeadSectionProps = {
  name: string
  title: React.ReactNode
  trailing?: React.ReactNode
  actions?: React.ReactNode
  state?: 'ready' | 'loading' | 'error'
  errorTitle?: React.ReactNode
  onRetry?: () => void
  className?: string
  children?: React.ReactNode
}

export function LeadSection({
  name,
  title,
  trailing,
  actions,
  state = 'ready',
  errorTitle,
  onRetry,
  className,
  children,
}: LeadSectionProps) {
  return (
    <div data-testid={`lead-card-${name}`} className={cn('w-full', className)}>
      <Accordion label={title} trailing={trailing} actions={actions} defaultOpen flush>
        <div className="flex flex-col gap-md px-md pt-2xs pb-md">
          {state === 'loading' ? (
            <div role="status" aria-label={`Loading ${name}`} className="flex flex-col gap-md">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[70%]" />
            </div>
          ) : state === 'error' ? (
            <div className="flex flex-col items-start gap-md">
              <Alert
                intent="danger"
                title={errorTitle ?? `Couldn't load ${name}`}
                className="w-full"
              >
                Check your connection, then try again.
              </Alert>
              {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  Try again
                </Button>
              )}
            </div>
          ) : (
            children
          )}
        </div>
      </Accordion>
    </div>
  )
}
