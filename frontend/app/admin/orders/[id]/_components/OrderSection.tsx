import * as React from 'react'
import { Accordion, Alert, Button, EmptyState, Skeleton, cn } from '@dorado/components'
import { Package } from '@dorado/icons'

export type SectionContent = 'loaded' | 'empty' | 'loading' | 'error'

export type OrderSectionProps = {
  title: React.ReactNode
  badge?: React.ReactNode
  closedBadge?: React.ReactNode
  actions?: React.ReactNode
  summary?: React.ReactNode
  bodyGap?: 'md' | 'xs-plus'
  layout?: 'desktop' | 'mobile'
  content?: SectionContent
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  emptyTitle?: React.ReactNode
  emptyDescription?: React.ReactNode
  emptyAction?: React.ReactNode
  errorTitle?: React.ReactNode
  onRetry?: () => void
  className?: string
  children?: React.ReactNode
}

export function SectionLoading({ label }: { label?: string }) {
  return (
    <div role="status" aria-label={label ?? 'Loading'} className="flex flex-col gap-md py-xs">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-[70%]" />
      <Skeleton className="h-3 w-[45%]" />
    </div>
  )
}

export function SectionError({ title, onRetry }: { title: React.ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-md">
      <Alert intent="danger" title={title} className="w-full">
        Check your connection, then try again.
      </Alert>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function OrderSection({
  title,
  badge,
  closedBadge,
  actions,
  summary,
  bodyGap = 'md',
  layout = 'desktop',
  content = 'loaded',
  open,
  onOpenChange,
  defaultOpen = true,
  emptyTitle,
  emptyDescription,
  emptyAction,
  errorTitle,
  onRetry,
  className,
  children,
}: OrderSectionProps) {
  const body =
    content === 'loading' ? (
      <SectionLoading
        label={typeof title === 'string' ? `Loading ${title.toLowerCase()}` : undefined}
      />
    ) : content === 'error' ? (
      <SectionError
        title={
          errorTitle ?? `Couldn’t load ${typeof title === 'string' ? title.toLowerCase() : 'this'}`
        }
        onRetry={onRetry}
      />
    ) : content === 'empty' ? (
      <EmptyState
        icon={<Package aria-hidden />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    ) : (
      children
    )

  const [innerOpen, setInnerOpen] = React.useState(defaultOpen)
  const isOpen = open ?? innerOpen
  const settled = content === 'loaded' || content === 'empty'
  const right = !settled
    ? badge
    : isOpen
      ? (actions != null || badge != null) && (
          <span className="flex items-center gap-xs">
            {badge}
            {actions}
          </span>
        )
      : (closedBadge ?? badge)

  return (
    <Accordion
      label={title}
      trailing={isOpen || content !== 'loaded' ? undefined : summary}
      actions={right || undefined}
      flush
      open={isOpen}
      onToggle={() => {
        if (open === undefined) setInnerOpen(!isOpen)
        onOpenChange?.(!isOpen)
      }}
      className={cn('w-full', className)}
    >
      <div
        data-layout={layout}
        data-content={content}
        className={cn(
          'flex flex-col px-md pt-2xs pb-md',
          bodyGap === 'xs-plus' ? 'gap-xs-plus' : 'gap-md'
        )}
      >
        {body}
      </div>
    </Accordion>
  )
}
