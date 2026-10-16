'use client'

import * as React from 'react'
import type { ShipmentView } from '@dorado/contracts'
import {
  Badge,
  Button,
  Input,
  Select,
  Tracker,
  cn,
  type BadgeProps,
  type SelectItemShape,
  type TrackerStepData,
} from '@dorado/components'

import { formatStamp } from '@/shared/utils/formatStamp'
import { Facts } from './Facts'
import { OrderSection } from './OrderSection'

export type ShipmentCardProps = {
  shipment: ShipmentView
  kind?: 'shipment' | 'return'
  shipsFrom?: string | null
  shipsTo?: string | null
  signature?: boolean
  carriers?: SelectItemShape[]
  onCancelLabel?: () => void
  onPrintLabel?: () => void
  onSaveTracking?: (input: { carrier_id: string | null; tracking_number: string }) => void
  layout?: 'desktop' | 'mobile'
  open?: boolean
  onOpenChange?: (open: boolean) => void
  pending?: boolean
}

type Intent = NonNullable<BadgeProps>['intent']

const intentFor = (label: string): Intent => {
  if (label === 'Delivered' || label === 'Returned') return 'success'
  if (label === 'Label Created' || label === 'Awaiting Tracking') return 'warning'
  if (label === 'Cancelled') return 'danger'
  return 'info'
}

const etaStamp = (iso: string | null) => formatStamp(iso).replace(/, (?=[^,]*$)/, ', by ')

export function trackerSteps(shipment: ShipmentView): TrackerStepData[] {
  const lastReached = shipment.timeline.map((step) => step.reached).lastIndexOf(true)
  const delivered = shipment.shipment.delivered_at != null
  return shipment.timeline.map((step, index) => ({
    label: step.stage,
    location: step.location ?? undefined,
    timestamp: step.scan_time ? formatStamp(step.scan_time) : undefined,
    state: !step.reached
      ? 'upcoming'
      : index === lastReached && !delivered
        ? 'current'
        : 'complete',
  }))
}

export function ShipmentCard({
  shipment,
  kind = 'shipment',
  shipsFrom,
  shipsTo,
  signature = false,
  carriers = [],
  onCancelLabel,
  onPrintLabel,
  onSaveTracking,
  layout = 'desktop',
  open,
  onOpenChange,
  pending = false,
}: ShipmentCardProps) {
  const mobile = layout === 'mobile'
  const back = kind === 'return'
  const row = shipment.shipment
  const tracked = row.tracking_number != null
  const status = tracked ? (shipment.tracking_status ?? 'Label Created') : 'Awaiting Tracking'
  const delivered = row.delivered_at != null
  const label = back && delivered ? 'Returned' : status
  const [carrierId, setCarrierId] = React.useState<string | null>(shipment.carrier_id)
  const [tracking, setTracking] = React.useState('')

  const buttons = (
    <div className={mobile ? 'flex w-full flex-col gap-xs' : 'flex items-center gap-xs'}>
      {onPrintLabel && row.label_type != null && (
        <Button
          size="sm"
          variant="secondary"
          className={mobile ? 'w-full' : 'order-2'}
          onClick={onPrintLabel}
        >
          Print Label
        </Button>
      )}
      {shipment.actions.cancel_label && onCancelLabel && (
        <Button
          size="sm"
          variant="secondary"
          intent="danger"
          disabled={pending}
          className={mobile ? 'w-full' : 'order-1'}
          onClick={onCancelLabel}
        >
          {back ? 'Cancel Return' : 'Cancel Shipment'}
        </Button>
      )}
    </div>
  )

  return (
    <OrderSection
      title={back ? 'Return Shipment' : 'Shipment'}
      layout={layout}
      open={open}
      onOpenChange={onOpenChange}
      badge={
        <Badge intent={intentFor(label)} variant="soft">
          {label}
        </Badge>
      }
    >
      {!tracked ? (
        <>
          <Facts
            layout={layout}
            facts={[
              { label: 'Ships from', value: shipsFrom },
              { label: 'Ships to', value: shipsTo },
            ]}
          />
          {shipment.actions.edit_tracking && onSaveTracking && (
            <div className={cn(mobile ? 'flex flex-col gap-sm' : 'flex items-end gap-sm')}>
              <Select
                label="Carrier"
                placeholder="Carrier"
                items={carriers}
                value={carrierId ?? undefined}
                onValueChange={setCarrierId}
                className={mobile ? undefined : 'w-[14.5rem] shrink-0'}
              />
              <Input
                label="Tracking #"
                placeholder="Paste the refiner’s tracking number"
                value={tracking}
                onChange={(event) => setTracking(event.target.value)}
                className="flex-1"
              />
              <Button
                disabled={tracking.trim() === '' || pending}
                className={mobile ? 'w-full' : undefined}
                onClick={() =>
                  onSaveTracking({ carrier_id: carrierId, tracking_number: tracking.trim() })
                }
              >
                Save Tracking
              </Button>
            </div>
          )}
          <p className="text-micro text-muted-foreground">
            Drop ship. The refiner creates the label; enter their tracking number and the Tracker
            takes over.
          </p>
        </>
      ) : status === 'Label Created' ? (
        <>
          <Facts
            layout={layout}
            facts={[
              { label: 'Tracking #', value: row.tracking_number },
              { label: 'Carrier', value: shipment.service?.name },
              { label: 'Label created', value: formatStamp(row.created_at) },
              back
                ? { label: 'Ships to', value: shipsTo }
                : { label: 'Ships from', value: shipsFrom },
              ...(signature ? [{ label: 'Delivery', value: 'Signature required' }] : []),
            ]}
          />
          <div
            className={mobile ? 'flex flex-col gap-md' : 'flex items-end justify-between gap-md'}
          >
            <p className="text-micro text-muted-foreground">
              {back
                ? 'Awaiting carrier pickup. The items go back to the customer once FedEx scans the package.'
                : 'Awaiting carrier pickup. Tracking appears here once FedEx scans the package.'}
            </p>
            {buttons}
          </div>
        </>
      ) : (
        <Tracker
          orientation={mobile ? 'vertical' : 'horizontal'}
          trackingNumber={row.tracking_number}
          etaLabel={delivered ? 'Delivered' : 'ETA'}
          eta={
            delivered
              ? formatStamp(row.delivered_at)
              : row.est_delivery
                ? etaStamp(row.est_delivery)
                : undefined
          }
          steps={trackerSteps(shipment)}
        />
      )}
    </OrderSection>
  )
}
