import * as React from 'react'

import { cn } from '../cn'
import { Divider } from '../divider/Divider'
import { Text } from '../text/Text'

export type EntityHeaderProps = {
  layout?: 'desktop' | 'mobile'
  eyebrow?: React.ReactNode
  badge?: React.ReactNode
  identity?: React.ReactNode
  title?: React.ReactNode
  reference?: React.ReactNode
  referenceSlot?: React.ReactNode
  meta?: React.ReactNode
  assignedTo?: React.ReactNode
  buttons?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function EntityHeader({
  layout = 'desktop',
  eyebrow,
  badge,
  identity,
  title,
  reference,
  referenceSlot,
  meta,
  assignedTo,
  buttons,
  actions,
  className,
}: EntityHeaderProps) {
  const mobile = layout === 'mobile'
  const hasActions = assignedTo != null || buttons != null || actions != null

  const identityBlock = (
    <div className={cn('flex min-w-0 flex-col', mobile ? 'gap-2xs' : 'flex-1 gap-xs')}>
      {(eyebrow != null || badge != null) && (
        <div className="flex items-center gap-xs">
          {eyebrow != null && (
            <Text variant="eyebrow" emphasis="subtle">
              {eyebrow}
            </Text>
          )}
          {badge}
        </div>
      )}
      {identity}
      {title != null && <Text variant="h2">{title}</Text>}
      {reference != null && (
        <Text variant="small" emphasis="subtle" as="p">
          {reference}
        </Text>
      )}
      {referenceSlot}
      {meta != null && (
        <Text variant="small" emphasis="subtle" as="p">
          {meta}
        </Text>
      )}
    </div>
  )

  const actionsBlock = hasActions && (
    <div className={cn('flex flex-col', mobile ? 'gap-sm' : 'shrink-0 gap-xs')}>
      {assignedTo}
      {buttons != null && <div className="flex gap-sm *:flex-1">{buttons}</div>}
      {actions}
    </div>
  )

  return (
    <section
      data-layout={layout}
      className={cn(
        'flex flex-col gap-sm rounded-lg border border-border bg-card',
        mobile ? 'px-md py-lg' : 'p-md',
        className
      )}
    >
      {mobile ? (
        <>
          {identityBlock}
          {hasActions && <Divider />}
          {actionsBlock}
        </>
      ) : (
        <div className="flex items-start justify-between gap-lg">
          {identityBlock}
          {actionsBlock}
        </div>
      )}
    </section>
  )
}
