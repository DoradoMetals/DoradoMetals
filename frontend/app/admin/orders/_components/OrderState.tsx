import * as React from 'react'
import type { OrderState as OrderStateValue } from '@dorado/contracts'
import { Badge, type BadgeProps } from '@dorado/components'

type Look = Pick<NonNullable<BadgeProps>, 'intent' | 'variant'>

const looks: Record<OrderStateValue, Look> = {
  'Awaiting Receipt': { intent: 'warning', variant: 'soft' },
  'Awaiting Finalize': { intent: 'warning', variant: 'soft' },
  'At Refiner': { intent: 'info', variant: 'soft' },
  'Ready to Pay': { intent: 'info', variant: 'soft' },
  'Awaiting Payment': { intent: 'warning', variant: 'soft' },
  Preparing: { intent: 'warning', variant: 'soft' },
  'In Transit': { intent: 'info', variant: 'soft' },
  'Pending Assay': { intent: 'warning', variant: 'soft' },
  'Awaiting Delivery': { intent: 'warning', variant: 'soft' },
  Settled: { intent: 'success', variant: 'soft' },
  Completed: { intent: 'success', variant: 'soft' },
  Disputed: { intent: 'danger', variant: 'soft' },
  Cancelled: { intent: 'danger', variant: 'soft' },
  Draft: { intent: 'neutral', variant: 'outline' },
}

export type OrderStateProps = Omit<BadgeProps, 'intent' | 'variant' | 'children'> & {
  state: OrderStateValue
}

export function OrderState({ state, ...props }: OrderStateProps) {
  return (
    <Badge {...looks[state]} {...props}>
      {state}
    </Badge>
  )
}

export const orderStates = Object.keys(looks) as OrderStateValue[]
