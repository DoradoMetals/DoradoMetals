'use client'

import * as React from 'react'
import {
  Badge,
  Button,
  DatePicker,
  Input,
  Select,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
  type SelectItemShape,
  type TimeGroup,
} from '@dorado/components'

import { OrderSection } from './OrderSection'

export type CreateMethod = 'shipment' | 'pickup' | 'appointment' | 'return' | 'dropoff'

export type CreateFulfillmentDraft = {
  carrier_service_id?: string
  package_id?: string
  handoff?: string
  ship_to_id?: string
  ship_from_id?: string
  declared_value?: string
  coverage?: string
  additional_coverage?: string
  bill_return_to_customer?: boolean
  driver_id?: string
  address_id?: string
  location_id?: string
  employee_id?: string
  refiner_id?: string
  date?: Date
  time?: string
}

export type CreateFulfillmentOptions = {
  services?: SelectItemShape[]
  packages?: SelectItemShape[]
  handoffs?: SelectItemShape[]
  places?: SelectItemShape[]
  coverages?: SelectItemShape[]
  drivers?: SelectItemShape[]
  addresses?: SelectItemShape[]
  offices?: SelectItemShape[]
  employees?: SelectItemShape[]
  refiners?: SelectItemShape[]
  timeGroups?: TimeGroup[]
  returnCharge?: React.ReactNode
}

export type CreateFulfillmentProps = {
  layout?: 'desktop' | 'mobile'
  methods: CreateMethod[]
  method: CreateMethod
  onMethodChange?: (method: CreateMethod) => void
  options: CreateFulfillmentOptions
  draft: CreateFulfillmentDraft
  onDraftChange: (patch: CreateFulfillmentDraft) => void
  onSubmit: (method: CreateMethod) => void
  pending?: boolean
  disabledDays?: React.ComponentProps<typeof DatePicker>['disabled']
}

const TAB_LABELS: Record<CreateMethod, string> = {
  shipment: 'Shipment',
  pickup: 'Pickup',
  appointment: 'Appointment',
  return: 'Return Shipment',
  dropoff: 'Drop-off',
}

const SUBMIT: Record<CreateMethod, string> = {
  shipment: 'Create Shipment',
  pickup: 'Create Pickup',
  appointment: 'Create Appointment',
  return: 'Create Return',
  dropoff: 'Create Drop-off',
}

const DATE_LABEL: Record<CreateMethod, string> = {
  shipment: 'Carrier pickup',
  pickup: 'Pickup date',
  appointment: 'Appointment date',
  return: 'Carrier pickup',
  dropoff: 'Drop-off date',
}

const TIME_LABEL: Record<CreateMethod, string> = {
  shipment: 'Pickup window',
  pickup: 'Window',
  appointment: 'Time',
  return: 'Pickup window',
  dropoff: 'Window',
}

export function CreateFulfillment({
  layout = 'desktop',
  methods,
  method,
  onMethodChange,
  options,
  draft,
  onDraftChange,
  onSubmit,
  pending = false,
  disabledDays,
}: CreateFulfillmentProps) {
  const mobile = layout === 'mobile'
  const row = mobile ? 'flex flex-col gap-sm' : 'flex gap-sm [&>*]:min-w-0 [&>*]:flex-1'
  const pick = (
    label: string,
    key: keyof CreateFulfillmentDraft,
    items: SelectItemShape[] | undefined
  ) => (
    <Select
      label={label}
      placeholder={label}
      items={items ?? []}
      value={(draft[key] as string | undefined) ?? undefined}
      onValueChange={(value) => onDraftChange({ [key]: value })}
    />
  )
  const money = (label: string, key: 'declared_value' | 'additional_coverage') => (
    <Input
      label={label}
      inputMode="decimal"
      trailing="$"
      value={draft[key] ?? ''}
      onChange={(event) => onDraftChange({ [key]: event.target.value })}
    />
  )
  const parcel = method === 'shipment' || method === 'return'

  const fields = (
    <div className="flex flex-col gap-sm">
      {parcel && (
        <>
          <div className={row}>
            {pick('Service', 'carrier_service_id', options.services)}
            {pick('Package size', 'package_id', options.packages)}
          </div>
          <div className={row}>
            {pick('Handoff', 'handoff', options.handoffs)}
            {pick('Ship to', 'ship_to_id', options.places)}
          </div>
          <div className={row}>{pick('Ship from', 'ship_from_id', options.places)}</div>
          <div className={row}>
            {money('Declared value', 'declared_value')}
            {pick('Coverage', 'coverage', options.coverages)}
            {money('Additional coverage', 'additional_coverage')}
          </div>
        </>
      )}
      {method === 'return' && (
        <div className="flex items-center gap-sm pt-2xs">
          <Switch
            aria-label="Bill return shipping to the customer"
            checked={draft.bill_return_to_customer ?? false}
            onCheckedChange={(checked) => onDraftChange({ bill_return_to_customer: checked })}
          />
          <span className="flex-1 text-small text-foreground">
            Bill return shipping to the customer
          </span>
          {options.returnCharge != null && (
            <span className="text-small font-medium text-foreground">{options.returnCharge}</span>
          )}
        </div>
      )}
      {method === 'pickup' && (
        <div className={row}>
          {pick('Driver', 'driver_id', options.drivers)}
          {pick('Pickup address', 'address_id', options.addresses)}
        </div>
      )}
      {method === 'appointment' && (
        <div className={row}>
          {pick('Office', 'location_id', options.offices)}
          {pick('With', 'employee_id', options.employees)}
        </div>
      )}
      {method === 'dropoff' && (
        <div className={row}>
          {pick('Driver', 'driver_id', options.drivers)}
          {pick('Refinery', 'refiner_id', options.refiners)}
        </div>
      )}
    </div>
  )

  const calendar = (
    <div className={cn('flex flex-col gap-3xs', !mobile && 'w-[21.375rem] shrink-0')}>
      <span className="text-small text-muted-foreground">{DATE_LABEL[method]}</span>
      <DatePicker
        mode="single"
        layout={mobile ? 'stacked' : 'slim'}
        selected={draft.date}
        onSelect={(date: Date | undefined) => onDraftChange({ date })}
        disabled={disabledDays}
        timeGroups={options.timeGroups}
        timeHeading={TIME_LABEL[method]}
        timeValue={draft.time ?? null}
        onTimeChange={(time) => onDraftChange({ time })}
        className="w-full"
      />
    </div>
  )

  const submit = (
    <Button disabled={pending} className="w-full" onClick={() => onSubmit(method)}>
      {SUBMIT[method]}
    </Button>
  )

  return (
    <OrderSection
      title="Fulfillment"
      layout={layout}
      badge={
        <Badge intent="neutral" variant="outline">
          Draft
        </Badge>
      }
    >
      {methods.length > 1 && (
        <Tabs value={method} onValueChange={(value) => onMethodChange?.(value as CreateMethod)}>
          <TabsList className={mobile ? undefined : 'px-lg py-lg'}>
            {methods.map((tab) => (
              <TabsTrigger key={tab} value={tab} className="flex-1">
                {TAB_LABELS[tab]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {mobile ? (
        <div className="flex flex-col gap-sm">
          {fields}
          {calendar}
          {submit}
        </div>
      ) : (
        <div className="flex gap-lg">
          <div className="flex min-w-0 flex-1 flex-col gap-sm">
            {fields}
            <div className="pt-2xs">{submit}</div>
          </div>
          {calendar}
        </div>
      )}
    </OrderSection>
  )
}

export const saleCreateMethods: CreateMethod[] = ['shipment', 'appointment']
export const purchaseCreateMethods: CreateMethod[] = ['shipment', 'pickup', 'appointment']
