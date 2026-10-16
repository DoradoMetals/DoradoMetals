import * as React from 'react'
import type { Action, FulfillmentView } from '@dorado/contracts'

import { formatClock, formatDay, formatStamp } from '@/shared/utils/formatStamp'
import type { ActionLook } from '../../_components/OrderActionButtons'
import { HandoffCard, type HandoffStep } from './HandoffCard'

const looks: Record<string, ActionLook> = {
  cancel_schedule: { label: 'Cancel Appointment', variant: 'secondary', intent: 'danger' },
  schedule: { label: 'Reschedule', variant: 'secondary' },
  IN_PROGRESS: { label: 'Check In', variant: 'primary' },
  COMPLETED: { label: 'Mark Complete', variant: 'primary' },
}

export type AppointmentCardProps = {
  view: FulfillmentView
  direction?: 'purchase' | 'sale' | string
  office?: string | null
  person?: string | null
  doneAt?: string | null
  onAction: (action: Action) => void
  layout?: 'desktop' | 'mobile'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  pending?: string | null
}

export function AppointmentCard({
  view,
  direction = 'purchase',
  office,
  person,
  doneAt,
  ...rest
}: AppointmentCardProps) {
  const status = view.fulfillment.status
  const sale = direction === 'sale'
  const steps: Record<string, HandoffStep> = {
    SCHEDULED: {
      label: 'Scheduled',
      intent: 'warning',
      note: sale ? 'Customer is collecting the items.' : 'Customer is bringing the items in.',
    },
    IN_PROGRESS: { label: 'In Progress', intent: 'info', note: 'Appointment in progress.' },
    COMPLETED: {
      label: 'Completed',
      intent: 'success',
      note: sale ? 'Items handed to the customer.' : 'Items are in-house. Finalize pricing.',
    },
  }
  const checkedIn = status === 'IN_PROGRESS' || status === 'COMPLETED'
  const start = view.direct?.start_time
  return (
    <HandoffCard
      title="Appointment"
      view={view}
      step={steps[status] ?? steps.SCHEDULED}
      looks={looks}
      facts={[
        checkedIn
          ? { label: 'Checked in', value: formatStamp(doneAt) }
          : { label: 'Date', value: formatDay(start) },
        { label: 'Office', value: office },
        { label: 'With', value: person },
        { label: 'Time', value: formatClock(start) },
      ]}
      {...rest}
    />
  )
}
