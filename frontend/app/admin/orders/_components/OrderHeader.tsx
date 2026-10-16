'use client'

import type { Action } from '@dorado/contracts'
import { useMediaUp } from '@dorado/components'

import { useAssignees, useAssignOrder, useOrderHeader } from '../_api'
import { OrderHeaderView } from './OrderHeaderView'
import type { OrderHeaderState } from './OrderState'

export type OrderHeaderProps = {
  orderId: string
  state?: OrderHeaderState
  place?: string
  onAction?: (action: Action) => void
  pending?: string | null
}

export function OrderHeader({ orderId, state, place, onAction, pending }: OrderHeaderProps) {
  const mobile = !useMediaUp('lg')
  const view = useOrderHeader(orderId).data
  const employees = useAssignees().data ?? []
  const assign = useAssignOrder(orderId)

  if (!view) return null

  return (
    <OrderHeaderView
      layout={mobile ? 'mobile' : 'desktop'}
      direction={view.order.direction}
      state={state ?? view.state}
      name={view.user?.name}
      reference={view.reference}
      place={place}
      ordersToDate={view.user?.orders_to_date}
      assignees={employees
        .filter((employee) => employee.enabled)
        .map((employee) => ({ value: employee.user_id, label: employee.name }))}
      assignedToId={view.order.assigned_to_id ?? null}
      onAssign={(assigned_to_id) =>
        assign.mutate({ assigned_to_id, expected_updated_at: view.order.updated_at ?? undefined })
      }
      actions={view.actions ?? []}
      onAction={onAction}
      pending={pending}
    />
  )
}
