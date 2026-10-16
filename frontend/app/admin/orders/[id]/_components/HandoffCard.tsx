import * as React from 'react'
import type { Action, FulfillmentView } from '@dorado/contracts'
import { Badge, cn, type BadgeProps } from '@dorado/components'

import { OrderActionButtons, type ActionLook } from '../../_components/OrderActionButtons'
import { Facts, type Fact } from './Facts'
import { OrderSection } from './OrderSection'

export type HandoffStep = {
  label: string
  intent: NonNullable<BadgeProps>['intent']
  note: React.ReactNode
}

export type HandoffCardProps = {
  title: string
  step: HandoffStep
  facts: Fact[]
  view: FulfillmentView
  looks: Record<string, ActionLook>
  onAction: (action: Action) => void
  layout?: 'desktop' | 'mobile'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  pending?: string | null
}

export function handoffActions(view: FulfillmentView): Action[] {
  const next = view.actions.transitions[0]
  const move = next ? view.actions.moves.find((candidate) => candidate.name === next) : undefined
  return [
    ...(view.actions.cancel_schedule
      ? [{ name: 'cancel_schedule', confirm: null, override: null }]
      : []),
    ...(view.actions.schedule && view.actions.cancel_schedule
      ? [{ name: 'schedule', confirm: null, override: null }]
      : []),
    ...(move ? [move] : []),
  ]
}

export function HandoffCard({
  title,
  step,
  facts,
  view,
  looks,
  onAction,
  layout = 'desktop',
  open,
  onOpenChange,
  pending = null,
}: HandoffCardProps) {
  const mobile = layout === 'mobile'
  const buttons = (
    <OrderActionButtons
      actions={handoffActions(view)}
      looks={looks}
      onAction={onAction}
      layout={layout}
      pending={pending}
    />
  )
  return (
    <OrderSection
      title={title}
      layout={layout}
      open={open}
      onOpenChange={onOpenChange}
      badge={
        <Badge intent={step.intent} variant="soft">
          {step.label}
        </Badge>
      }
    >
      <Facts facts={facts} layout={layout} />
      <div
        className={cn(mobile ? 'flex flex-col gap-md' : 'flex items-end justify-between gap-md')}
      >
        <p className="text-micro text-muted-foreground">{step.note}</p>
        {buttons}
      </div>
    </OrderSection>
  )
}
