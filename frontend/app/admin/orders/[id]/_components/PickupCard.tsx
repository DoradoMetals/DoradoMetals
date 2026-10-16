import * as React from 'react'
import type { Action, FulfillmentView } from '@dorado/contracts'

import { formatStamp, formatWindow } from '@/shared/utils/formatStamp'
import type { ActionLook } from '../../_components/OrderActionButtons'
import { HandoffCard, type HandoffStep } from './HandoffCard'

const steps: Record<string, HandoffStep> = {
  SCHEDULED: {
    label: 'Scheduled',
    intent: 'warning',
    note: 'Driver assigned. Awaiting the pickup window.',
  },
  IN_TRANSIT: {
    label: 'In Transit',
    intent: 'info',
    note: 'Driver is on the way to the customer.',
  },
  PICKED_UP: {
    label: 'Picked Up',
    intent: 'success',
    note: 'Items are in-house. Finalize pricing.',
  },
}

const looks: Record<string, ActionLook> = {
  cancel_schedule: { label: 'Cancel Pickup', variant: 'secondary', intent: 'danger' },
  schedule: { label: 'Reschedule', variant: 'secondary' },
  IN_TRANSIT: { label: 'Headed to Pickup', variant: 'primary' },
  PICKED_UP: { label: 'Mark Picked Up', variant: 'primary' },
}

export type PickupCardProps = {
  view: FulfillmentView
  office?: string | null
  driver?: string | null
  address?: string | null
  doneAt?: string | null
  onAction: (action: Action) => void
  layout?: 'desktop' | 'mobile'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  pending?: string | null
}

export function PickupCard({ view, office, driver, address, doneAt, ...rest }: PickupCardProps) {
  const status = view.fulfillment.status
  const done = status === 'PICKED_UP'
  return (
    <HandoffCard
      title="Pickup"
      view={view}
      step={steps[status] ?? steps.SCHEDULED}
      looks={looks}
      facts={[
        done
          ? { label: 'Picked up', value: formatStamp(doneAt) }
          : {
              label: 'Window',
              value: formatWindow(view.pickup?.start_time, view.pickup?.end_time),
            },
        { label: 'Office', value: office },
        { label: 'Driver', value: driver },
        { label: 'Pickup address', value: address },
      ]}
      {...rest}
    />
  )
}
