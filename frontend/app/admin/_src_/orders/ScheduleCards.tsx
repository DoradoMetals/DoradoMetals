'use client'

import { Badge, Button } from '@dorado/components'
import type { FulfillmentView } from '@dorado/contracts'

import { CardFact, OrderCard } from './OrderCard'
import { DASH, when } from './format'

export type ScheduleCardProps = {
  fulfillment: FulfillmentView
  onCancel: () => void
  onReschedule: () => void
  onAdvance: (status: string) => void
  pending?: boolean
}

// The three booked handovers. Each runs the same shape - a badge, four facts,
// Cancel / Reschedule, and one button that moves it on - and each takes its
// status straight off the fulfillment row, because the status vocabulary is the
// fulfillment domain's and not this screen's.
type Phase = { label: string; intent: 'warning' | 'info' | 'success'; next: string | null; nextLabel: string }

function phasesFor(kind: 'pickup' | 'appointment' | 'dropoff'): Phase[] {
  if (kind === 'pickup') {
    return [
      { label: 'Scheduled', intent: 'warning', next: 'In Transit', nextLabel: 'Headed to Pickup' },
      { label: 'In Transit', intent: 'info', next: 'Picked Up', nextLabel: 'Mark Picked Up' },
      { label: 'Picked Up', intent: 'success', next: null, nextLabel: 'Picked Up' },
    ]
  }
  if (kind === 'appointment') {
    return [
      { label: 'Scheduled', intent: 'warning', next: 'In Progress', nextLabel: 'Check In' },
      { label: 'In Progress', intent: 'info', next: 'Completed', nextLabel: 'Mark Complete' },
      { label: 'Completed', intent: 'success', next: null, nextLabel: 'Completed' },
    ]
  }
  return [
    { label: 'Scheduled', intent: 'warning', next: 'In Transit', nextLabel: 'Headed to Refinery' },
    { label: 'In Transit', intent: 'info', next: 'Dropped Off', nextLabel: 'Mark Dropped Off' },
    { label: 'Dropped Off', intent: 'success', next: null, nextLabel: 'Dropped Off' },
  ]
}

function ScheduleCard({
  kind,
  title,
  facts,
  fulfillment,
  onCancel,
  onReschedule,
  onAdvance,
  pending,
}: ScheduleCardProps & {
  kind: 'pickup' | 'appointment' | 'dropoff'
  title: string
  facts: { label: string; value: string }[]
}) {
  const phases = phasesFor(kind)
  const phase = phases.find((one) => one.label === fulfillment.fulfillment.status) ?? phases[0]!

  return (
    <OrderCard
      title={title}
      summary={when(fulfillment.scheduled_at)}
      right={
        <Badge intent={phase.intent} variant="soft">
          {phase.label}
        </Badge>
      }
    >
      <div className="flex w-full items-start justify-between gap-md">
        {facts.map((fact, index) => (
          <CardFact
            key={fact.label}
            label={fact.label}
            value={fact.value}
            align={index === facts.length - 1 ? 'end' : 'start'}
          />
        ))}
      </div>
      <div className="flex w-full justify-end gap-sm">
        {fulfillment.actions.cancel_schedule && (
          <Button variant="secondary" intent="danger" disabled={pending} onClick={onCancel}>
            {kind === 'pickup' ? 'Cancel Pickup' : kind === 'appointment' ? 'Cancel' : 'Cancel Drop-off'}
          </Button>
        )}
        <Button variant="secondary" disabled={pending} onClick={onReschedule}>
          Reschedule
        </Button>
        <Button
          variant="primary"
          disabled={phase.next === null || pending}
          onClick={() => phase.next && onAdvance(phase.next)}
        >
          {phase.nextLabel}
        </Button>
      </div>
    </OrderCard>
  )
}

export function PickupCard(props: ScheduleCardProps) {
  const pickup = props.fulfillment.pickup
  return (
    <ScheduleCard
      {...props}
      kind="pickup"
      title="Pickup"
      facts={[
        { label: 'Window', value: when(pickup?.start_time) },
        { label: 'Office', value: DASH },
        { label: 'Driver', value: pickup?.assigned_employee_id ?? DASH },
        { label: 'Pickup address', value: pickup?.pickup_address_id ?? DASH },
      ]}
    />
  )
}

export function AppointmentCard(props: ScheduleCardProps) {
  const direct = props.fulfillment.direct
  return (
    <ScheduleCard
      {...props}
      kind="appointment"
      title="Appointment"
      facts={[
        { label: 'Date', value: when(direct?.start_time) },
        { label: 'Office', value: direct?.location_id ?? DASH },
        { label: 'With', value: direct?.assigned_employee_id ?? DASH },
        { label: 'Time', value: when(direct?.start_time) },
      ]}
    />
  )
}

export function DropoffCard(props: ScheduleCardProps) {
  return (
    <ScheduleCard
      {...props}
      kind="dropoff"
      title="Drop-off"
      facts={[
        { label: 'Driver', value: DASH },
        { label: 'Refinery', value: DASH },
        { label: 'Window', value: when(props.fulfillment.scheduled_at) },
      ]}
    />
  )
}
