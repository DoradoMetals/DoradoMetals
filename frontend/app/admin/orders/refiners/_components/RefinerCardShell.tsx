'use client'

import * as React from 'react'
import { Accordion, Alert, Button, EmptyState, Skeleton } from '@dorado/components'
import { Package } from '@dorado/icons'

export type RefinerCardContent = 'loaded' | 'empty' | 'loading' | 'error'

export type RefinerCardShellProps = {
  label: string
  content: RefinerCardContent
  actions?: React.ReactNode
  emptyTitle: string
  emptyDescription: string
  errorTitle: string
  onRetry?: () => void
  className?: string
  children?: React.ReactNode
}

export function RefinerCardShell({
  label,
  content,
  actions,
  emptyTitle,
  emptyDescription,
  errorTitle,
  onRetry,
  className,
  children,
}: RefinerCardShellProps) {
  return (
    <Accordion
      label={label}
      chevron="leading"
      defaultOpen
      flush
      actions={content === 'loaded' ? actions : undefined}
      className={className}
    >
      <div data-content={content} className="flex flex-col gap-md px-md pt-2xs pb-md">
        {content === 'loading' && (
          <div
            role="status"
            aria-label={`Loading ${label.toLowerCase()}`}
            className="flex flex-col gap-md"
          >
            <Skeleton className="w-full" />
            <Skeleton className="w-[70%]" />
            <Skeleton className="w-[45%]" />
          </div>
        )}
        {content === 'error' && (
          <>
            <Alert intent="danger" title={errorTitle}>
              Check your connection, then try again.
            </Alert>
            <Button variant="secondary" size="sm" className="self-start" onClick={onRetry}>
              Try again
            </Button>
          </>
        )}
        {content === 'empty' && (
          <EmptyState
            icon={<Package aria-hidden />}
            title={emptyTitle}
            description={emptyDescription}
          />
        )}
        {content === 'loaded' && children}
      </div>
    </Accordion>
  )
}
