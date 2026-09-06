'use client'

import * as React from 'react'
import {
  Badge,
  Button,
  DatePicker,
  EmptyState,
  Input,
  Select,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@dorado/components'
import { Truck } from '@dorado/icons'
import type {
  Address,
  CarrierHandoff,
  CarrierServiceRead,
  EmployeeSummary,
  FulfillmentDropoffChoices,
  FulfillmentMethodRead,
  FulfillmentPatchBody,
  FulfillmentView,
  Location,
  PackageRead,
  RefinerView,
  Shipment,
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
  cover?: Pick<Shipment, 'insured' | 'additional_coverage' | 'bill_return_to_customer'> | null
  locations?: Location[]
  employees?: EmployeeSummary[]
  refiners?: RefinerView[]
  onCreate?: () => void
  createDisabled?: boolean
  createReason?: string
  onSetMethod: (method_id: string) => void
  onPatch: (choices: FulfillmentPatchBody) => void
  onSchedule: (dropoff?: FulfillmentDropoffChoices) => void
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
  cover = null,
  locations = [],
  employees = [],
  refiners = [],
  onCreate,
  createDisabled = false,
  createReason,
  onSetMethod,
  onPatch,
  onSchedule,
  pending = false,
}: FulfillmentCardProps) {
  // A DROP-OFF HAS NO ROW UNTIL IT IS SCHEDULED, and `PATCH /fulfillments/:id`
  // with a `dropoff` arm answers 200 having written nothing, so its choices are
  // held here and sent whole to `schedule_dropoff` - which is also what the
  // Figma card says: nothing is saved until the button.
  const [draft, setDraft] = React.useState<FulfillmentDropoffChoices>({})
  const booked = fulfillment?.dropoff ?? null
  React.useEffect(() => setDraft({}), [booked?.id])
  const chosen = <K extends keyof FulfillmentDropoffChoices>(key: K) =>
    (draft[key] ?? booked?.[key] ?? undefined) as FulfillmentDropoffChoices[K]

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
  const outstanding =
    category === 'DROPOFF'
      ? fulfillment.missing.filter((step) => chosen(step as keyof FulfillmentDropoffChoices) == null)
      : fulfillment.missing
  const ready = outstanding.length === 0

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
          cover={cover}
          onPatch={onPatch}
        />
      )}

      {category === 'PICKUP' && (
        <div className="grid w-full grid-cols-2 gap-md">
          <Select
            label="Pickup address"
            items={addresses.map((address) => ({
              value: address.id,
              label: `${address.line_1 ?? DASH}, ${address.city ?? DASH}`,
            }))}
            value={fulfillment.pickup?.pickup_address_id ?? undefined}
            onValueChange={(pickup_address_id) => onPatch({ pickup: { pickup_address_id } })}
          />
          <Select
            label="Office"
            items={locationItems(locations)}
            value={fulfillment.pickup?.location_id ?? undefined}
            onValueChange={(location_id) => onPatch({ pickup: { location_id } })}
            placeholder="Which office"
          />
          <Select
            label="Driver"
            items={employeeItems(employees)}
            value={fulfillment.pickup?.assigned_employee_id ?? undefined}
            onValueChange={(assigned_employee_id) =>
              onPatch({ pickup: { assigned_employee_id } })
            }
            placeholder="Who drives"
          />
          <DateField
            label="Window"
            value={fulfillment.pickup?.start_time ?? null}
            onChange={(start_time) => onPatch({ pickup: { start_time } })}
          />
        </div>
      )}

      {category === 'DIRECT' && (
        <div className="grid w-full grid-cols-2 gap-md">
          <Select
            label="Office"
            items={locationItems(locations)}
            value={fulfillment.direct?.location_id ?? undefined}
            onValueChange={(location_id) => onPatch({ direct: { location_id } })}
            placeholder="Which office"
          />
          <Select
            label="With"
            items={employeeItems(employees)}
            value={fulfillment.direct?.assigned_employee_id ?? undefined}
            onValueChange={(assigned_employee_id) =>
              onPatch({ direct: { assigned_employee_id } })
            }
            placeholder="Who takes it"
          />
          <DateField
            label="Appointment"
            value={fulfillment.direct?.start_time ?? null}
            onChange={(start_time) => onPatch({ direct: { start_time } })}
          />
        </div>
      )}

      {category === 'DROPOFF' && (
        <div className="grid w-full grid-cols-2 gap-md">
          <Select
            label="Driver"
            items={employeeItems(employees)}
            value={chosen('driver_employee_id') ?? undefined}
            onValueChange={(driver_employee_id) =>
              setDraft((was) => ({ ...was, driver_employee_id }))
            }
            placeholder="Who drives"
          />
          <Select
            label="Refinery"
            items={refiners.map((one) => ({
              value: one.id,
              label: one.organization.name ?? one.id,
            }))}
            value={chosen('refiner_id') ?? undefined}
            onValueChange={(refiner_id) => setDraft((was) => ({ ...was, refiner_id }))}
            placeholder="Which refinery"
          />
          <DateField
            label="Drop-off date"
            value={chosen('start_time') ?? null}
            onChange={(start_time) => setDraft((was) => ({ ...was, start_time }))}
          />
        </div>
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
          onClick={() => onSchedule(category === 'DROPOFF' ? draft : undefined)}
        >
          Schedule
        </Button>
      </div>
      {!ready && (
        <p className="text-right text-micro text-muted-foreground">
          Still to choose: {outstanding.join(', ')}
        </p>
      )}
    </OrderCard>
  )
}

const locationItems = (locations: Location[]) =>
  locations.map((one) => ({ value: one.id, label: one.name ?? one.type ?? one.id }))

const employeeItems = (employees: EmployeeSummary[]) =>
  employees.map((one) => ({ value: one.id, label: one.name ?? one.id }))

function ShipmentChoices({
  fulfillment,
  services,
  packages,
  handoffs,
  addresses,
  cover,
  onPatch,
}: {
  fulfillment: FulfillmentView
  services: CarrierServiceRead[]
  packages: PackageRead[]
  handoffs: CarrierHandoff[]
  addresses: Address[]
  cover: Pick<Shipment, 'insured' | 'additional_coverage' | 'bill_return_to_customer'> | null
  onPatch: (choices: FulfillmentPatchBody) => void
}) {
  const parcel = fulfillment.parcel
  const isReturn = parcel?.direction === 'Return'
  const addressItems = addresses.map((address) => ({
    value: address.id,
    label: `${address.line_1 ?? DASH}, ${address.city ?? DASH}`,
  }))

  return (
    <>
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
      <div className="flex w-full items-end gap-md">
        <Switch
          label="Coverage"
          checked={cover?.insured ?? false}
          onCheckedChange={(insured) => onPatch({ shipment: { insured } })}
        />
        <AmountField
          label="Additional coverage"
          value={cover?.additional_coverage ?? null}
          onCommit={(additional_coverage) => onPatch({ shipment: { additional_coverage } })}
        />
        {isReturn && (
          <Switch
            label="Bill return shipping to the customer"
            checked={cover?.bill_return_to_customer ?? false}
            onCheckedChange={(bill_return_to_customer) =>
              onPatch({ shipment: { bill_return_to_customer } })
            }
          />
        )}
      </div>
    </>
  )
}

function AmountField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number | null
  onCommit: (next: number) => void
}) {
  const asText = value === null ? '' : String(value)
  const [draft, setDraft] = React.useState(asText)
  React.useEffect(() => setDraft(asText), [asText])
  return (
    <Input
      label={label}
      type="number"
      inputMode="decimal"
      className="flex-1"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = Number(draft)
        if (!Number.isFinite(next) || next === value) return
        onCommit(next)
      }}
    />
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
    <div role="group" aria-label={label} className="flex flex-col gap-3xs">
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
