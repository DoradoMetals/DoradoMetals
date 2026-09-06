'use client'

import * as React from 'react'
import { Badge, Button, Input, Select, Tracker, type TrackerStepData } from '@dorado/components'
import type { ShipmentView } from '@dorado/contracts'

import { CardFact, OrderCard } from './OrderCard'
import { DASH, when } from './format'

export type ShipmentCardProps = {
  shipment: ShipmentView
  title?: string
  onSaveTracking: (tracking_number: string) => void
  onCancelLabel: () => void
  services?: { id: string; name: string }[]
  pending?: boolean
}

type Phase = 'label' | 'awaiting' | 'transit' | 'done' | 'exception'

const BADGE: Record<Phase, { label: string; intent: 'warning' | 'info' | 'success' | 'danger'; variant: 'soft' | 'outline' }> = {
  label: { label: 'Label Created', intent: 'warning', variant: 'outline' },
  awaiting: { label: 'Awaiting Tracking', intent: 'warning', variant: 'outline' },
  transit: { label: 'In Transit', intent: 'info', variant: 'soft' },
  done: { label: 'Delivered', intent: 'success', variant: 'soft' },
  exception: { label: 'Exception', intent: 'danger', variant: 'soft' },
}

// The parcel. Which phase it is in follows the shipment's own facts, and what
// may be done to it follows `actions` - a scanned parcel can only be
// intercepted or returned, so Cancel goes the moment it moves.
function phaseOf(view: ShipmentView): Phase {
  if (view.shipment.delivered_at) return 'done'
  if ((view.tracking_status ?? '').toLowerCase().includes('exception')) return 'exception'
  if (view.shipment.shipped_at || view.tracking.length > 0) return 'transit'
  if (!view.shipment.tracking_number) return 'awaiting'
  return 'label'
}

export function ShipmentCard({
  shipment,
  title,
  onSaveTracking,
  onCancelLabel,
  services = [],
  pending = false,
}: ShipmentCardProps) {
  const phase = phaseOf(shipment)
  const badge = BADGE[phase]
  const isReturn = shipment.shipment.direction === 'Return'
  const heading = title ?? (isReturn ? 'Return Shipment' : 'Shipment')

  const steps: TrackerStepData[] = shipment.timeline.map((step) => ({
    label: step.stage,
    location: step.location ?? 'Pending',
    timestamp: step.scan_time ? when(step.scan_time) : DASH,
    state: step.reached ? 'complete' : 'upcoming',
  }))

  const [draft, setDraft] = React.useState(shipment.shipment.tracking_number ?? '')
  React.useEffect(() => setDraft(shipment.shipment.tracking_number ?? ''), [shipment.shipment.tracking_number])

  return (
    <OrderCard
      title={heading}
      summary={shipment.shipment.tracking_number ?? badge.label}
      right={
        <Badge intent={badge.intent} variant={badge.variant}>
          {isReturn && phase === 'done' ? 'Returned' : badge.label}
        </Badge>
      }
    >
      {phase === 'awaiting' ? (
        <>
          <div className="flex w-full items-start justify-between gap-md">
            <CardFact label="Ships from" value={shipment.shipment.shipper_address_id ?? DASH} />
            <CardFact label="Ships to" value={shipment.shipment.recipient_address_id ?? DASH} />
            <CardFact label="Service" value={shipment.service?.name ?? DASH} align="end" />
          </div>
          <div className="flex w-full items-end gap-md">
            {services.length > 0 && (
              <Select
                label="Carrier"
                className="flex-1"
                items={services.map((service) => ({ value: service.id, label: service.name }))}
                value={shipment.shipment.carrier_service_id ?? undefined}
                disabled
                placeholder="The refiner's carrier"
              />
            )}
            <Input
              label="Tracking #"
              className="flex-1"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              variant="primary"
              size="lg"
              disabled={draft.trim().length === 0 || pending || !shipment.actions.edit_tracking}
              onClick={() => onSaveTracking(draft.trim())}
            >
              Save Tracking
            </Button>
          </div>
        </>
      ) : phase === 'label' ? (
        <>
          <div className="flex w-full items-start justify-between gap-md">
            <CardFact label="Tracking #" value={shipment.shipment.tracking_number ?? DASH} />
            <CardFact label="Service" value={shipment.service?.name ?? DASH} />
            <CardFact label="Package" value={shipment.package?.label ?? DASH} />
            <CardFact label="Created" value={when(shipment.shipment.created_at)} align="end" />
          </div>
          <p className="text-small text-muted-foreground">
            The label exists and the carrier has not scanned it yet.
          </p>
          <div className="flex w-full justify-end gap-sm">
            {shipment.actions.cancel_label && (
              <Button
                variant="secondary"
                intent="danger"
                disabled={pending}
                onClick={onCancelLabel}
              >
                Cancel Shipment
              </Button>
            )}
          </div>
        </>
      ) : (
        <Tracker
          steps={steps}
          header
          trackingNumber={shipment.shipment.tracking_number ?? DASH}
          etaLabel={phase === 'done' ? 'Delivered' : 'Estimated'}
          eta={when(shipment.shipment.delivered_at ?? shipment.shipment.est_delivery)}
        />
      )}
    </OrderCard>
  )
}
