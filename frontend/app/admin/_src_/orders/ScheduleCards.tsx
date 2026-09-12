'use client'

import { Badge, Button } from '@dorado/components'
import type {
  EmployeeSummary,
  FulfillmentStatus,
  FulfillmentView,
  Location,
  RefinerView,
} from '@dorado/contracts'

import { CardFact, OrderCard } from './OrderCard'
import { DASH, when } from './format'

export type ScheduleCardProps = {
  fulfillment: FulfillmentView
  locations?: Location[]
  employees?: EmployeeSummary[]
  refiners?: RefinerView[]
  onCancel: () => void
  onReschedule: () => void
  onAdvance: (status: FulfillmentStatus) => void
  pending?: boolean
}

const STATUS_LABEL: Record<FulfillmentStatus, string> = {
  PENDING: 'Pending',
  SCHEDULED: 'Scheduled',
  IN_TRANSIT: 'In Transit',
  PICKED_UP: 'Picked Up',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  DROPPED_OFF: 'Dropped Off',
}

const STATUS_INTENT: Record<FulfillmentStatus, 'warning' | 'info' | 'success'> = {
  PENDING: 'warning',
  SCHEDULED: 'warning',
  IN_TRANSIT: 'info',
  PICKED_UP: 'success',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  DROPPED_OFF: 'success',
}

type Kind = 'pickup' | 'appointment' | 'dropoff'

const MOVE_LABEL: Record<Kind, Partial<Record<FulfillmentStatus, string>>> = {
  pickup: { IN_TRANSIT: 'Headed to Pickup', PICKED_UP: 'Mark Picked Up' },
  appointment: { IN_PROGRESS: 'Check In', COMPLETED: 'Mark Complete' },
  dropoff: { IN_TRANSIT: 'Headed to Refinery', DROPPED_OFF: 'Mark Dropped Off' },
}

const CANCEL_LABEL: Record<Kind, string> = {
  pickup: 'Cancel Pickup',
  appointment: 'Cancel',
  dropoff: 'Cancel Drop-off',
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
  kind: Kind
  title: string
  facts: { label: string; value: string }[]
}) {
  const status = fulfillment.fulfillment.status
  const moves = fulfillment.actions.transitions.filter((one) => MOVE_LABEL[kind][one])

  return (
    <OrderCard
      title={title}
      summary={when(fulfillment.scheduled_at)}
      right={
        <Badge intent={STATUS_INTENT[status]} variant="soft">
          {STATUS_LABEL[status]}
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
            {CANCEL_LABEL[kind]}
          </Button>
        )}
        <Button variant="secondary" disabled={pending} onClick={onReschedule}>
          Reschedule
        </Button>
        {moves.length === 0 ? (
          <Button variant="primary" disabled>
            {STATUS_LABEL[status]}
          </Button>
        ) : (
          moves.map((move) => (
            <Button key={move} variant="primary" disabled={pending} onClick={() => onAdvance(move)}>
              {MOVE_LABEL[kind][move]}
            </Button>
          ))
        )}
      </div>
    </OrderCard>
  )
}

const nameOf = (
  id: string | null | undefined,
  rows: { id: string; name?: string | null }[]
): string => rows.find((one) => one.id === id)?.name ?? DASH

export function PickupCard(props: ScheduleCardProps) {
  const pickup = props.fulfillment.pickup
  return (
    <ScheduleCard
      {...props}
      kind="pickup"
      title="Pickup"
      facts={[
        { label: 'Window', value: when(pickup?.start_time) },
        { label: 'Office', value: nameOf(pickup?.location_id, props.locations ?? []) },
        { label: 'Driver', value: nameOf(pickup?.assigned_employee_id, props.employees ?? []) },
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
        { label: 'Office', value: nameOf(direct?.location_id, props.locations ?? []) },
        { label: 'With', value: nameOf(direct?.assigned_employee_id, props.employees ?? []) },
        { label: 'Time', value: when(direct?.start_time) },
      ]}
    />
  )
}

export function DropoffCard(props: ScheduleCardProps) {
  const dropoff = props.fulfillment.dropoff
  const refinery =
    (props.refiners ?? []).find((one) => one.id === dropoff?.refiner_id)?.organization.name ?? DASH
  return (
    <ScheduleCard
      {...props}
      kind="dropoff"
      title="Drop-off"
      facts={[
        { label: 'Driver', value: nameOf(dropoff?.driver_employee_id, props.employees ?? []) },
        { label: 'Refinery', value: refinery },
        { label: 'Window', value: when(dropoff?.start_time ?? props.fulfillment.scheduled_at) },
      ]}
    />
  )
}
