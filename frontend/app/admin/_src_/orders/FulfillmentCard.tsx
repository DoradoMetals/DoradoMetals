'use client'

import * as React from 'react'
import { Badge, Button, DatePicker, EmptyState, Select, Tabs, TabsList, TabsTrigger } from '@dorado/components'
import { Truck } from '@dorado/icons'
import type {
  Address,
  CarrierHandoff,
  CarrierServiceRead,
  FulfillmentMethodRead,
  FulfillmentPatchBody,
  FulfillmentView,
  PackageRead,
} from '@dorado/contracts'

import { CardFact, OrderCard } from './OrderCard'
import { DASH, money } from './format'

export type FulfillmentCardProps = {
  fulfillment: FulfillmentView | null
  methods: FulfillmentMethodRead[]
  services: CarrierServiceRead[]
  packages: PackageRead[]
  handoffs: CarrierHandoff[]
  addresses: Address[]
  onCreate?: () => void
  createDisabled?: boolean
  createReason?: string
  onSetMethod: (method_id: string) => void
  onPatch: (choices: FulfillmentPatchBody) => void
  onSchedule: () => void
  pending?: boolean
}

const TAB_ORDER: FulfillmentMethodRead['category'][] = ['SHIPMENT', 'PICKUP', 'DIRECT', 'DROPOFF']

const TAB_LABEL: Record<FulfillmentMethodRead['category'], string> = {
  SHIPMENT: 'Shipment',
  PICKUP: 'Pickup',
  DIRECT: 'Appointment',
  DROPOFF: 'Drop-off',
}

// Empty: no method yet, an Empty State and Create fulfillment. Chosen: the
// method tabs plus that method's own choices, and Schedule once `missing` is
// empty. What is missing is the fulfillment domain's answer, never a check
// written here.
export function FulfillmentCard({
  fulfillment,
  methods,
  services,
  packages,
  handoffs,
  addresses,
  onCreate,
  createDisabled = false,
  createReason,
  onSetMethod,
  onPatch,
  onSchedule,
  pending = false,
}: FulfillmentCardProps) {
  if (!fulfillment) {
    return (
      <OrderCard
        title="Fulfillment · Not set"
        right={
          <Badge intent="neutral" variant="outline">
            Not set
          </Badge>
        }
      >
        <EmptyState
          icon={<Truck />}
          title="No fulfillment yet"
          description="Nothing has been arranged for this order."
          action={
            <Button
              variant="primary"
              disabled={createDisabled || !onCreate || pending}
              onClick={() => onCreate?.()}
            >
              Create fulfillment
            </Button>
          }
        />
        {createReason && <p className="text-center text-micro text-muted-foreground">{createReason}</p>}
      </OrderCard>
    )
  }

  const category = fulfillment.method.category
  const offered = TAB_ORDER.filter((one) => methods.some((method) => method.category === one))
  const ready = fulfillment.missing.length === 0

  return (
    <OrderCard
      title="Create Fulfillment"
      right={
        <Badge intent={ready ? 'info' : 'warning'} variant="soft">
          {ready ? 'Ready' : `${fulfillment.missing.length} to choose`}
        </Badge>
      }
    >
      <Tabs
        value={category}
        onValueChange={(next) => {
          const method = methods.find((one) => one.category === next)
          if (method && method.id !== fulfillment.method.id) onSetMethod(method.id)
        }}
      >
        <TabsList>
          {offered.map((one) => (
            <TabsTrigger key={one} value={one}>
              {TAB_LABEL[one]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {category === 'SHIPMENT' && (
        <ShipmentChoices
          fulfillment={fulfillment}
          services={services}
          packages={packages}
          handoffs={handoffs}
          addresses={addresses}
          onPatch={onPatch}
        />
      )}

      {category === 'PICKUP' && (
        <div className="flex w-full items-end gap-md">
          <Select
            label="Pickup address"
            className="flex-1"
            items={addresses.map((address) => ({
              value: address.id,
              label: `${address.line_1 ?? DASH}, ${address.city ?? DASH}`,
            }))}
            value={fulfillment.pickup?.pickup_address_id ?? undefined}
            onValueChange={(pickup_address_id) => onPatch({ pickup: { pickup_address_id } })}
          />
          <DateField
            label="Window"
            value={fulfillment.pickup?.start_time ?? null}
            onChange={(start_time) => onPatch({ pickup: { start_time } })}
          />
        </div>
      )}

      {category === 'DIRECT' && (
        <div className="flex w-full items-end gap-md">
          <DateField
            label="Appointment"
            value={fulfillment.direct?.start_time ?? null}
            onChange={(start_time) => onPatch({ direct: { start_time } })}
          />
        </div>
      )}

      {category === 'DROPOFF' && (
        <p className="text-small text-muted-foreground">
          Drop-offs are arranged off-screen for now.
        </p>
      )}

      {fulfillment.parcel?.id && (
        <div className="flex w-full items-start justify-between gap-md">
          <CardFact label="Declared value" value={money(null)} />
          <CardFact label="Tracking #" value={fulfillment.parcel.tracking_number ?? DASH} />
        </div>
      )}

      <div className="flex w-full justify-end">
        <Button
          variant="primary"
          size="lg"
          disabled={!ready || !fulfillment.actions.schedule || pending}
          onClick={onSchedule}
        >
          Schedule
        </Button>
      </div>
      {!ready && (
        <p className="text-right text-micro text-muted-foreground">
          Still to choose: {fulfillment.missing.join(', ')}
        </p>
      )}
    </OrderCard>
  )
}

function ShipmentChoices({
  fulfillment,
  services,
  packages,
  handoffs,
  addresses,
  onPatch,
}: {
  fulfillment: FulfillmentView
  services: CarrierServiceRead[]
  packages: PackageRead[]
  handoffs: CarrierHandoff[]
  addresses: Address[]
  onPatch: (choices: FulfillmentPatchBody) => void
}) {
  const parcel = fulfillment.parcel
  const addressItems = addresses.map((address) => ({
    value: address.id,
    label: `${address.line_1 ?? DASH}, ${address.city ?? DASH}`,
  }))

  return (
    <div className="grid w-full grid-cols-3 gap-md">
      <Select
        label="Service"
        items={services.map((service) => ({ value: service.id, label: service.name }))}
        value={parcel?.carrier_service_id ?? undefined}
        onValueChange={(carrier_service_id) => onPatch({ shipment: { carrier_service_id } })}
      />
      <Select
        label="Package size"
        items={packages.map((one) => ({ value: one.id, label: one.label }))}
        value={parcel?.package_id ?? undefined}
        onValueChange={(package_id) => onPatch({ shipment: { package_id } })}
      />
      <Select
        label="Handoff"
        items={handoffs.map((one) => ({ value: one.code, label: one.name }))}
        placeholder="How it is handed over"
      />
      <Select
        label="Ship from"
        items={addressItems}
        value={parcel?.shipper_address_id ?? undefined}
        onValueChange={(shipper_address_id) => onPatch({ shipment: { shipper_address_id } })}
      />
      <Select
        label="Ship to"
        items={addressItems}
        value={parcel?.recipient_address_id ?? undefined}
        onValueChange={(recipient_address_id) => onPatch({ shipment: { recipient_address_id } })}
      />
      <DateField
        label="Carrier pickup"
        value={parcel?.pickup_date ?? null}
        onChange={(pickup_date) => onPatch({ shipment: { pickup_date } })}
      />
    </div>
  )
}

// The Slim datepicker with its own label above it - Figma's calendar slot.
function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
}) {
  const selected = value ? new Date(value) : undefined
  return (
    <div className="flex flex-col gap-3xs">
      <p className="text-small font-medium text-muted-foreground">{label}</p>
      <DatePicker
        layout="slim"
        mode="single"
        selected={Number.isNaN(selected?.getTime() ?? NaN) ? undefined : selected}
        onSelect={(next?: Date) => {
          if (next) onChange(next.toISOString())
        }}
      />
    </div>
  )
}
