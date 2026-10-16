import * as React from 'react'
import type { Action } from '@dorado/contracts'
import { EntityHeader, Select, type SelectItemShape } from '@dorado/components'

import { OrderActionButtons, type ActionLook } from './OrderActionButtons'
import { OrderState, type OrderHeaderState } from './OrderState'

export const NOBODY = 'nobody'

export const headerActionLooks: Record<string, ActionLook> = {
  cancel: { label: 'Cancel', variant: 'secondary', intent: 'danger' },
  refund: { label: 'Refund', variant: 'secondary', intent: 'danger' },
  adopt_assay: { label: 'Adopt assay', variant: 'secondary' },
  buy_label: { label: 'Buy label', variant: 'secondary' },
  reopen: { label: 'Reopen', variant: 'secondary' },
  finalize: { label: 'Finalize', variant: 'primary' },
  allocate_stock: { label: 'Allocate stock', variant: 'primary' },
}

export type OrderHeaderViewProps = {
  layout?: 'desktop' | 'mobile'
  direction: string | null
  state: OrderHeaderState
  name?: React.ReactNode
  reference: React.ReactNode
  place?: React.ReactNode
  ordersToDate?: number | null
  assignees: SelectItemShape[]
  assignedToId: string | null
  onAssign: (assignedToId: string | null) => void
  actions?: Action[]
  onAction?: (action: Action) => void
  pending?: string | null
}

export function OrderHeaderView({
  layout = 'desktop',
  direction,
  state,
  name,
  reference,
  place,
  ordersToDate,
  assignees,
  assignedToId,
  onAssign,
  actions = [],
  onAction,
  pending = null,
}: OrderHeaderViewProps) {
  const sale = direction === 'sale'
  const buttons = onAction ? (
    <OrderActionButtons
      bare
      size="default"
      actions={actions}
      looks={headerActionLooks}
      onAction={onAction}
      pending={pending}
    />
  ) : null
  const hasButtons = onAction != null && actions.some((action) => action.name in headerActionLooks)

  return (
    <EntityHeader
      layout={layout}
      eyebrow={sale ? 'Sales order' : 'Purchase order'}
      badge={<OrderState state={state} />}
      title={name}
      reference={
        place ? (
          <>
            {reference}
            <span aria-hidden className="mx-xs">
              ·
            </span>
            {place}
          </>
        ) : (
          reference
        )
      }
      meta={
        ordersToDate != null
          ? `${ordersToDate} ${ordersToDate === 1 ? 'order' : 'orders'} to date`
          : undefined
      }
      assignedTo={
        <Select
          label="Assigned to"
          placeholder="Assigned to"
          items={[{ value: NOBODY, label: 'Unassigned' }, ...assignees]}
          value={assignedToId ?? NOBODY}
          onValueChange={(value) => onAssign(value === NOBODY ? null : value)}
        />
      }
      buttons={hasButtons ? buttons : undefined}
    />
  )
}
