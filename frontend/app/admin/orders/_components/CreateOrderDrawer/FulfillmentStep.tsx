'use client'

import * as React from 'react'
import { Calendar, RadioGroup, Select, Text } from '@dorado/components'
import {
  useAddressBook,
  useCarrierServices,
  useEmployees,
  useFulfillmentMethods,
  useLocations,
  usePackages,
  useRefiners,
  useRefinerFulfillmentMethods,
} from '@dorado/client'
import type {
  AdminOrderFulfillment,
  FulfillmentDirectChoices,
  FulfillmentDropoffChoices,
  FulfillmentMethodRead,
  FulfillmentPickupChoices,
  FulfillmentShipmentChoices,
  OrderPreview,
} from '@dorado/contracts'

import { directionOf, laterAllowed, isRefiner, type DrawerState } from '../../_lib/createOrder'
import {
  HANDOFF_LABEL,
  PICKUP_WINDOWS,
  TIME_SLOTS,
  addressLabel,
  formatMoney,
  slotOn,
} from '../../_lib/createOrderView'
import { Chip, Section, Tile } from './parts'

const LATER = 'later'

type Category = FulfillmentMethodRead['category']

const TILE_COPY: Record<string, { title: string; purchase: string; sale: string }> = {
  SHIPMENT: {
    title: 'Shipment',
    purchase: 'The customer ships it in on a carrier label.',
    sale: 'A carrier delivers it to the customer.',
  },
  PICKUP: {
    title: 'Dorado pickup',
    purchase: "Our courier collects at the customer's address.",
    sale: "Our courier delivers to the customer's address.",
  },
  DIRECT: {
    title: 'Appointment',
    purchase: 'The customer brings it to one of our offices.',
    sale: 'The customer collects it at one of our offices.',
  },
  DROPOFF: {
    title: 'Drop-off',
    purchase: 'We drive the lots to the refinery.',
    sale: 'We drive the lots to the refinery.',
  },
}

const CATEGORY_ORDER = ['SHIPMENT', 'PICKUP', 'DIRECT', 'DROPOFF']

const toDate = (iso: string | null | undefined): Date | undefined =>
  iso ? new Date(iso) : undefined

const dayKey = (day: Date): string =>
  `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`

export function FulfillmentStep({
  state,
  update,
  preview,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
  preview: OrderPreview | null
}) {
  const refiner = isRefiner(state.kind)
  const direction = directionOf(state.kind)
  const customerMethods = useFulfillmentMethods(direction, { enabled: !refiner }).data
  const refinerMethods = useRefinerFulfillmentMethods({ enabled: refiner }).data
  const methods = (refiner ? refinerMethods : customerMethods) ?? []
  const lots = !laterAllowed(state)
  const current =
    state.fulfillment === LATER || state.fulfillment === null ? null : state.fulfillment
  const method = current ? methods.find((m) => m.id === current.method_id) : undefined
  const selected = state.fulfillment === LATER ? LATER : (method?.category ?? '')
  const categories = CATEGORY_ORDER.filter((c) => methods.some((m) => m.category === c))
  const question = refiner
    ? 'How do the lots reach the refiner?'
    : direction === 'sale'
      ? 'How does the metal go out?'
      : 'How does the metal come in?'

  const choose = (value: string) => {
    if (value === LATER) return update({ fulfillment: LATER })
    const options = methods.filter((m) => m.category === value)
    const picked = options.find((m) => m.is_default) ?? options[0]
    if (!picked) return
    update({
      fulfillment: { method_id: picked.id, choices: emptyChoices(value as Category, state) },
    })
  }

  const setChoices = (choices: AdminOrderFulfillment['choices']) =>
    current && update({ fulfillment: { ...current, choices } })

  return (
    <>
      <Section title={question}>
        <RadioGroup
          value={selected}
          onValueChange={choose}
          className="grid grid-cols-1 gap-xs sm:grid-cols-2"
        >
          {categories.map((category) => (
            <Tile
              key={category}
              value={category}
              title={TILE_COPY[category]!.title}
              description={
                direction === 'sale' ? TILE_COPY[category]!.sale : TILE_COPY[category]!.purchase
              }
            />
          ))}
          <Tile
            value={LATER}
            title="Decide later"
            disabled={lots}
            description={
              lots
                ? 'A sale with lots chooses it now.'
                : 'The order screen asks for it before anything moves.'
            }
          />
        </RadioGroup>
      </Section>
      {current && method?.category === 'SHIPMENT' && (
        <ShipmentDetails
          state={state}
          methods={methods.filter((m) => m.category === 'SHIPMENT')}
          method={method}
          choices={'shipment' in current.choices ? current.choices.shipment : {}}
          preview={preview}
          onMethod={(method_id) => update({ fulfillment: { method_id, choices: current.choices } })}
          onChange={(shipment) => setChoices({ shipment })}
          onShipTo={(ship_to_location_id) => update({ ship_to_location_id })}
        />
      )}
      {current && method?.category === 'PICKUP' && (
        <PickupDetails
          state={state}
          choices={'pickup' in current.choices ? current.choices.pickup : {}}
          onChange={(pickup) => setChoices({ pickup })}
        />
      )}
      {current && method?.category === 'DIRECT' && (
        <DirectDetails
          methods={methods.filter((m) => m.category === 'DIRECT')}
          method={method}
          choices={'direct' in current.choices ? current.choices.direct : {}}
          onMethod={(method_id) => update({ fulfillment: { method_id, choices: current.choices } })}
          onChange={(direct) => setChoices({ direct })}
        />
      )}
      {current && method?.category === 'DROPOFF' && (
        <DropoffDetails
          choices={'dropoff' in current.choices ? current.choices.dropoff : {}}
          onChange={(dropoff) => setChoices({ dropoff })}
        />
      )}
    </>
  )
}

function emptyChoices(category: Category, state: DrawerState): AdminOrderFulfillment['choices'] {
  if (category === 'PICKUP') return { pickup: {} }
  if (category === 'DIRECT') return { direct: {} }
  if (category === 'DROPOFF')
    return { dropoff: state.refiner_id ? { refiner_id: state.refiner_id } : {} }
  return { shipment: {} }
}

function useEmployeeItems() {
  return (useEmployees().data ?? [])
    .filter((employee) => employee.enabled)
    .map((employee) => ({ value: employee.user_id, label: employee.name ?? 'Unnamed' }))
}

function useLocationItems() {
  return (useLocations().data ?? []).map((location) => ({
    value: location.id,
    label: location.name,
  }))
}

function useAddressItems(user_id: string | null) {
  return (useAddressBook(user_id).data ?? [])
    .filter((entry) => entry.address)
    .map((entry) => ({ value: entry.address.id, label: addressLabel(entry) }))
}

function DayAndSlot({
  label,
  start,
  onChange,
}: {
  label: string
  start: string | null | undefined
  onChange: (start: string) => void
}) {
  const [day, setDay] = React.useState<Date>(() => toDate(start) ?? new Date())
  const hour = toDate(start)?.getHours()
  return (
    <div className="flex flex-col gap-xs">
      <Calendar
        mode="single"
        selected={day}
        onSelect={(next: Date | undefined) => {
          if (!next) return
          setDay(next)
          if (hour !== undefined) onChange(slotOn(next, hour))
        }}
      />
      <Select
        label={label}
        placeholder="Choose a time"
        items={TIME_SLOTS.map((slot) => ({ value: String(slot.hour), label: slot.label }))}
        value={hour === undefined ? undefined : String(hour)}
        onValueChange={(value) => onChange(slotOn(day, Number(value)))}
      />
    </div>
  )
}

function ShipmentDetails({
  state,
  methods,
  method,
  choices,
  preview,
  onMethod,
  onChange,
  onShipTo,
}: {
  state: DrawerState
  methods: FulfillmentMethodRead[]
  method: FulfillmentMethodRead
  choices: FulfillmentShipmentChoices
  preview: OrderPreview | null
  onMethod: (method_id: string) => void
  onChange: (choices: FulfillmentShipmentChoices) => void
  onShipTo: (location_id: string) => void
}) {
  const sale = directionOf(state.kind) === 'sale'
  const services = (useCarrierServices().data ?? []).map((s) => ({ value: s.id, label: s.name }))
  const packages = (usePackages().data ?? []).map((p) => ({ value: p.id, label: p.label }))
  const addresses = useAddressItems(state.customer_id)
  const offices = useLocationItems()
  const set = (patch: FulfillmentShipmentChoices) => onChange({ ...choices, ...patch })
  const ownLabel = method.type === 'OWN LABEL'
  const courier = method.type === 'CARRIER PICKUP'

  return (
    <Section title="Shipment details">
      {methods.length > 1 && (
        <RadioGroup value={method.id} onValueChange={onMethod} className="flex flex-wrap gap-xs">
          {methods.map((m) => (
            <Chip key={m.id} value={m.id} label={HANDOFF_LABEL[m.type] ?? m.label} />
          ))}
        </RadioGroup>
      )}
      {!ownLabel && (
        <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
          <Select
            label="Service"
            placeholder="Choose a service"
            items={services}
            value={choices.carrier_service_id ?? undefined}
            onValueChange={(carrier_service_id) => set({ carrier_service_id })}
          />
          {!sale && (
            <Select
              label="Package size"
              placeholder="Choose a package"
              items={packages}
              value={choices.package_id ?? undefined}
              onValueChange={(package_id) => set({ package_id })}
            />
          )}
        </div>
      )}
      {sale ? (
        <Select
          label="Ship to"
          placeholder="Choose the delivery address"
          items={addresses}
          value={choices.recipient_address_id ?? undefined}
          onValueChange={(recipient_address_id) => set({ recipient_address_id })}
        />
      ) : (
        <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
          <Select
            label="Ship to"
            placeholder="Choose an office"
            items={offices}
            value={state.ship_to_location_id ?? undefined}
            onValueChange={onShipTo}
          />
          <Select
            label="Ship from"
            placeholder="Choose the customer address"
            items={addresses}
            value={choices.shipper_address_id ?? undefined}
            onValueChange={(shipper_address_id) => set({ shipper_address_id })}
          />
        </div>
      )}
      {courier && (
        <div className="flex flex-col gap-xs">
          <Calendar
            mode="single"
            selected={choices.pickup_date ? new Date(`${choices.pickup_date}T12:00:00`) : undefined}
            onSelect={(day: Date | undefined) => day && set({ pickup_date: dayKey(day) })}
          />
          <Select
            label="Pickup window"
            placeholder="Choose a window"
            items={PICKUP_WINDOWS}
            value={choices.pickup_time ?? undefined}
            onValueChange={(pickup_time) => set({ pickup_time })}
          />
        </div>
      )}
      {!ownLabel && !sale && (
        <div className="grid grid-cols-1 items-end gap-xs sm:grid-cols-2">
          <Select
            label="Coverage"
            placeholder="Choose coverage"
            items={[
              { value: 'carrier', label: 'Carrier standard' },
              { value: 'declared', label: 'Full declared value' },
            ]}
            value={
              choices.insured === undefined || choices.insured === null
                ? undefined
                : choices.insured
                  ? 'declared'
                  : 'carrier'
            }
            onValueChange={(value) => set({ insured: value === 'declared' })}
          />
          <div className="flex flex-col gap-3xs">
            <Text variant="micro" className="text-muted-foreground">
              Declared value
            </Text>
            <Text variant="small-medium">{formatMoney(preview?.total ?? 0)}</Text>
          </div>
        </div>
      )}
    </Section>
  )
}

function PickupDetails({
  state,
  choices,
  onChange,
}: {
  state: DrawerState
  choices: FulfillmentPickupChoices
  onChange: (choices: FulfillmentPickupChoices) => void
}) {
  const employees = useEmployeeItems()
  const offices = useLocationItems()
  const addresses = useAddressItems(state.customer_id)
  const set = (patch: FulfillmentPickupChoices) => onChange({ ...choices, ...patch })
  return (
    <Section title="Pickup details">
      <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
        <Select
          label="Driver"
          placeholder="Choose a driver"
          items={employees}
          value={choices.assigned_employee_id ?? undefined}
          onValueChange={(assigned_employee_id) => set({ assigned_employee_id })}
        />
        <Select
          label="Bring to"
          placeholder="Choose an office"
          items={offices}
          value={choices.location_id ?? undefined}
          onValueChange={(location_id) => set({ location_id })}
        />
      </div>
      <Select
        label="Pickup address"
        placeholder="Choose the customer address"
        items={addresses}
        value={choices.pickup_address_id ?? undefined}
        onValueChange={(pickup_address_id) => set({ pickup_address_id })}
      />
      <DayAndSlot
        label="Window"
        start={choices.start_time}
        onChange={(start_time) => set({ start_time })}
      />
    </Section>
  )
}

function DirectDetails({
  methods,
  method,
  choices,
  onMethod,
  onChange,
}: {
  methods: FulfillmentMethodRead[]
  method: FulfillmentMethodRead
  choices: FulfillmentDirectChoices
  onMethod: (method_id: string) => void
  onChange: (choices: FulfillmentDirectChoices) => void
}) {
  const employees = useEmployeeItems()
  const offices = useLocationItems()
  const set = (patch: FulfillmentDirectChoices) => onChange({ ...choices, ...patch })
  return (
    <Section title="Appointment details">
      <RadioGroup value={method.id} onValueChange={onMethod} className="flex flex-wrap gap-xs">
        {methods.map((m) => (
          <Chip key={m.id} value={m.id} label={m.type === 'WALK IN' ? 'Walk in' : 'Scheduled'} />
        ))}
      </RadioGroup>
      <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
        <Select
          label="Office"
          placeholder="Choose an office"
          items={offices}
          value={choices.location_id ?? undefined}
          onValueChange={(location_id) => set({ location_id })}
        />
        <Select
          label="With"
          placeholder="Choose a person"
          items={employees}
          value={choices.assigned_employee_id ?? undefined}
          onValueChange={(assigned_employee_id) => set({ assigned_employee_id })}
        />
      </div>
      <DayAndSlot
        label="Time"
        start={choices.start_time}
        onChange={(start_time) => set({ start_time })}
      />
    </Section>
  )
}

function DropoffDetails({
  choices,
  onChange,
}: {
  choices: FulfillmentDropoffChoices
  onChange: (choices: FulfillmentDropoffChoices) => void
}) {
  const employees = useEmployeeItems()
  const offices = useLocationItems()
  const refiners = (useRefiners().data ?? []).map((r) => ({
    value: r.id,
    label: r.organization.name,
  }))
  const set = (patch: FulfillmentDropoffChoices) => onChange({ ...choices, ...patch })
  return (
    <Section title="Drop-off details">
      <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
        <Select
          label="Driver"
          placeholder="Choose a driver"
          items={employees}
          value={choices.driver_employee_id ?? undefined}
          onValueChange={(driver_employee_id) => set({ driver_employee_id })}
        />
        <Select
          label="From"
          placeholder="Choose an office"
          items={offices}
          value={choices.location_id ?? undefined}
          onValueChange={(location_id) => set({ location_id })}
        />
      </div>
      <Select
        label="Refinery"
        placeholder="Choose the refinery"
        items={refiners}
        value={choices.refiner_id ?? undefined}
        onValueChange={(refiner_id) => set({ refiner_id })}
      />
      <DayAndSlot
        label="Window"
        start={choices.start_time}
        onChange={(start_time) =>
          set({
            start_time,
            end_time: new Date(Date.parse(start_time) + 2 * 3_600_000).toISOString(),
          })
        }
      />
    </Section>
  )
}
