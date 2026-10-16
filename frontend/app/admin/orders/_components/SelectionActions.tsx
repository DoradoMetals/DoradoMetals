'use client'

import * as React from 'react'
import { Button, cn, Select, type SelectItemShape, SelectionBar } from '@dorado/components'

export type SelectionAction = {
  name: string
  label: string
  submitLabel: string
  items: SelectItemShape[]
  value?: string
  onValueChange: (value: string) => void
  onSubmit: () => void
  enabled: boolean
  reason?: React.ReactNode
  pending?: boolean
}

export type SelectionActionsProps = {
  summary: React.ReactNode
  totals?: React.ReactNode
  actions: SelectionAction[]
  onDismiss?: () => void
  dismissLabel?: string
  layout?: 'desktop' | 'mobile'
  className?: string
  ref?: React.Ref<HTMLDivElement>
}

function ActionRow({ action, layout }: { action: SelectionAction; layout: 'desktop' | 'mobile' }) {
  const mobile = layout === 'mobile'
  const available = action.enabled && !action.pending
  return (
    <div className={cn('flex flex-col gap-2xs', mobile && 'w-full')}>
      <div className={cn('flex gap-sm', mobile ? 'flex-col' : 'items-end')}>
        <Select
          label={action.label}
          items={action.items}
          value={action.value}
          onValueChange={action.onValueChange}
          disabled={!action.enabled}
          className={mobile ? undefined : 'w-80'}
        />
        <Button
          size={mobile ? 'lg' : 'default'}
          disabled={!available || action.value == null}
          onClick={action.onSubmit}
        >
          {action.submitLabel}
        </Button>
      </div>
      {!action.enabled && action.reason != null && (
        <p className="text-micro text-muted-foreground">{action.reason}</p>
      )}
    </div>
  )
}

export function SelectionActions({
  summary,
  totals,
  actions,
  onDismiss,
  dismissLabel,
  layout = 'desktop',
  className,
  ref,
}: SelectionActionsProps) {
  return (
    <SelectionBar
      ref={ref}
      layout={layout}
      summary={summary}
      totals={totals}
      onDismiss={onDismiss}
      dismissLabel={dismissLabel}
      className={className}
      actions={
        <div className={cn('flex gap-lg', layout === 'mobile' ? 'w-full flex-col' : 'items-start')}>
          {actions.map((action) => (
            <ActionRow key={action.name} action={action} layout={layout} />
          ))}
        </div>
      }
    />
  )
}
