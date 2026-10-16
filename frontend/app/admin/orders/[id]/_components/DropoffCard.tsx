import * as React from 'react'
import type { Action, FulfillmentView } from '@dorado/contracts'

import { formatDay, formatStamp } from '@/shared/utils/formatStamp'
import type { ActionLook } from '../../_components/OrderActionButtons'
import { HandoffCard, type HandoffStep } from './HandoffCard'

const steps: Record<string, HandoffStep> = {
  SCHEDULED: {
    label: 'Scheduled',
    intent: 'warning',
    note: 'Lots sealed and manifested. Awaiting the drop-off window.',
  },
  IN_TRANSIT: {
    label: 'In Transit',
    intent: 'info',
    note: 'Driver is on the way to the refinery with the sealed lots.',
  },
  DROPPED_OFF: {
    label: 'Dropped Off',
    intent: 'success',
    note: 'Lots received at the refinery. Settlement follows their assay.',
  },
}

const looks: Record<string, ActionLook> = {
  cancel_schedule: { label: 'Cancel Drop-off', variant: 'secondary', intent: 'danger' },
  IN_TRANSIT: { label: 'Headed to Refinery', variant: 'primary' },
  DROPPED_OFF: { label: 'Mark Dropped Off', variant: 'primary' },
}

export type DropoffCardProps = {
  view: FulfillmentView
  refinery?: string | null
  driver?: string | null
  address?: string | null
  receivedBy?: string | null
  onAction: (action: Action) => void
  layout?: 'desktop' | 'mobile'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  pending?: string | null
}

export function DropoffCard({
  view,
  refinery,
  driver,
  address,
  receivedBy,
  ...rest
}: DropoffCardProps) {
  const status = view.fulfillment.status
  const done = status === 'DROPPED_OFF'
  return (
    <HandoffCard
      title="Drop-off"
      view={view}
      step={steps[status] ?? steps.SCHEDULED}
      looks={looks}
      facts={[
        done
          ? { label: 'Dropped off', value: formatStamp(view.dropoff?.dropped_off_at) }
          : { label: 'Date', value: formatDay(view.dropoff?.start_time) },
        { label: 'Refinery', value: refinery },
        { label: 'Driver', value: driver },
        done
          ? { label: 'Received by', value: receivedBy }
          : { label: 'Drop-off address', value: address },
      ]}
      {...rest}
    />
  )
}
