'use client'

import { EntityHeader, Select, useMediaUp } from '@dorado/components'

import { useAssignees, useAssignOrder, useOrderHeader } from '../_api'
import { OrderState } from './OrderState'

const NOBODY = 'nobody'

export function OrderHeader({ orderId }: { orderId: string }) {
  const mobile = !useMediaUp('lg')
  const view = useOrderHeader(orderId).data
  const employees = useAssignees().data ?? []
  const assign = useAssignOrder(orderId)

  if (!view) return null

  const sale = view.order.direction === 'sale'

  return (
    <EntityHeader
      layout={mobile ? 'mobile' : 'desktop'}
      eyebrow={sale ? 'Sales order' : 'Purchase order'}
      badge={<OrderState state={view.state} />}
      title={view.user?.name}
      reference={view.reference}
      meta={
        view.user
          ? `${view.user.orders_to_date} ${view.user.orders_to_date === 1 ? 'order' : 'orders'} to date`
          : undefined
      }
      assignedTo={
        <Select
          label="Assigned to"
          placeholder="Assigned to"
          items={[
            { value: NOBODY, label: 'Unassigned' },
            ...employees
              .filter((employee) => employee.enabled)
              .map((employee) => ({ value: employee.user_id, label: employee.name })),
          ]}
          value={view.order.assigned_to_id ?? NOBODY}
          onValueChange={(value) =>
            assign.mutate({ assigned_to_id: value === NOBODY ? null : value })
          }
        />
      }
    />
  )
}
