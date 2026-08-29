'use client'

import { useMemo } from 'react'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { formatFullDate } from '@/shared/utils/formatDates'
import StatusChip from '@/shared/ui/StatusChip'
import UpdatedByline from '@/shared/ui/UpdatedByline'

import { Label } from '@/shared/ui/base/label'
import { Input } from '@/shared/ui/base/input'
import { Textarea } from '@/shared/ui/base/textarea'
import { DisplayToggle } from '@/shared/ui/DisplayToggle'

import type { Carrier, CarrierService } from '@/features/carriers/types'
import {
  useUpdateCarrierService,
  useDeleteCarrierService,
  useCarrierServicesByCarrier,
} from '@/features/carriers/queries'
import { RadioGroup } from '@/shared/ui/RadioGroup'
import DotSelect from '@/shared/ui/DotSelect'
import { Button } from '@/shared/ui/base/button'
import Image from 'next/image'

// <time dateTime> must be machine-readable; the wire hands these back as
// either a Date or an ISO string depending on the source switch.
const machineDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString() : undefined

export default function CarrierServiceDrawer({
  services,
  service_id,
  carriers,
}: {
  services: CarrierService[]
  service_id: string
  carriers: Carrier[]
}) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'carrierServices'

  const service = useMemo(() => services.find((s) => s.id === service_id), [services, service_id])

  const carrier = useMemo(() => {
    if (!service) return null
    return carriers.find((c) => c.id === service.carrier_id) ?? null
  }, [carriers, service])

  if (!service) return null

  return (
    <Drawer label="Carrier service" open={isDrawerOpen} setOpen={closeDrawer}>
      <Header service={service} carrier={carrier} />
      <hr />
      <div className="space-y-8">
        <Details service={service} carriers={carriers} />
        <hr />

        <Handoffs service={service} />
        <hr />

        <Insurance service={service} />
        <hr />

        <Packaging service={service} />
        <hr />

        <TransitTime service={service} />
        <hr />

        <Flags service={service} />
        <hr />

        <Dev service={service} />
        <hr />

        <DangerZone service={service} onDone={closeDrawer} />
        <hr />

        <Footer service={service} />
      </div>
    </Drawer>
  )
}

function Header({ service, carrier }: { service: CarrierService; carrier: Carrier | null }) {
  const active = !!service.is_active

  return (
    <div className="flex flex-col w-full gap-8">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            <div className="relative flex items-center justify-center h-8">
              {carrier?.logo ? (
                <Image
                  src={carrier.logo}
                  alt={`${carrier.organization.name} logo`}
                  height={50}
                  width={50}
                  className="object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-md bg-muted" />
              )}
            </div>
            <h2>{service.name}</h2>
          </div>
        </div>

        <StatusChip positive={active} size="lg">
          {active ? 'Active' : 'Inactive'}
        </StatusChip>
      </div>

      <UpdatedByline name={service.updated_by} date={formatFullDate(service.updated_at)} />
    </div>
  )
}

function Details({ service, carriers }: { service: CarrierService; carriers: Carrier[] }) {
  const updateService = useUpdateCarrierService()

  const handlePatch = (patch: Partial<CarrierService>) => {
    updateService.mutate({ ...service, ...patch })
  }

  return (
    <div className="flex flex-col w-full gap-6">
      <p className="eyebrow mb-4">Details</p>

      <div className="flex flex-col gap-2">
        <RadioGroup
          value={service.carrier_id}
          onValueChange={(id) => handlePatch({ carrier_id: id })}
          options={carriers}
          getValue={(c) => c.id}
          isOptionDisabled={(c) => !c.organization.enabled}
          variant="tile"
          className="flex w-full items-center gap-4"
          optionClassName="flex-1"
        >
          {(c) => (
            <div className="relative flex h-12 w-full items-center justify-center">
              <Image
                src={c.logo ?? ''}
                fill
                alt={`${c.organization.name ?? ''} logo`}
                className="object-contain p-1"
              />
            </div>
          )}
        </RadioGroup>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="name" className="pl-1">
          Service Name
        </Label>
        <Input
          id="name"
          placeholder="Enter service name..."
          type="text"
          defaultValue={service.name ?? ''}
          onBlur={(e) => handlePatch({ name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="code" className="pl-1">
            Code
          </Label>
          <Input
            id="code"
            placeholder="UI code (e.g. Express Saver)"
            type="text"
            defaultValue={service.code ?? ''}
            onBlur={(e) => handlePatch({ code: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="provider_code" className="pl-1">
            Provider Code
          </Label>
          <Input
            id="provider_code"
            placeholder="FedEx/UPS internal code..."
            type="text"
            defaultValue={service.provider_code ?? ''}
            onBlur={(e) => handlePatch({ provider_code: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col w-full gap-1">
        <Label htmlFor="description" className="pl-1">
          Description
        </Label>
        <Textarea
          rows={10}
          id="description"
          placeholder="Enter service description..."
          className="min-w-70"
          defaultValue={service.description ?? ''}
          onBlur={(e) => handlePatch({ description: e.target.value || null })}
        />
      </div>
    </div>
  )
}

function Handoffs({ service }: { service: CarrierService }) {
  const updateService = useUpdateCarrierService()
  const handlePatch = (patch: Partial<CarrierService>) => {
    updateService.mutate({ ...service, ...patch })
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">Handoffs</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-6 items-stretch">
        <DisplayToggle
          label="Supports Pickup"
          value={!!service.supports_pickup}
          onChange={(v) => handlePatch({ supports_pickup: v })}
        />
        <DisplayToggle
          label="Supports Dropoff"
          value={!!service.supports_dropoff}
          onChange={(v) => handlePatch({ supports_dropoff: v })}
        />
        <DisplayToggle
          label="Supports Returns"
          value={!!service.supports_returns}
          onChange={(v) => handlePatch({ supports_returns: v })}
        />
      </div>
    </div>
  )
}

function TransitTime({ service }: { service: CarrierService }) {
  const updateService = useUpdateCarrierService()
  const handlePatch = (patch: Partial<CarrierService>) =>
    updateService.mutate({ ...service, ...patch })

  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">Transit Time</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="min_transit_days" className="pl-1">
            Min Transit Days
          </Label>
          <Input
            id="min_transit_days"
            type="number"
            inputMode="numeric"
            placeholder="1 day..."
            className="text-left no-spinner"
            defaultValue={service.min_transit_days ?? ''}
            onBlur={(e) => {
              handlePatch({ min_transit_days: Number(e.target.value) ?? null })
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="max_transit_days" className="pl-1">
            Max Transit Days
          </Label>
          <Input
            id="max_transit_days"
            type="number"
            inputMode="numeric"
            placeholder="3 days..."
            className="text-left no-spinner"
            defaultValue={service.max_transit_days ?? ''}
            onBlur={(e) => {
              handlePatch({ max_transit_days: Number(e.target.value) ?? null })
            }}
          />
        </div>
      </div>
    </div>
  )
}

function Insurance({ service }: { service: CarrierService }) {
  const updateService = useUpdateCarrierService()
  const handlePatch = (patch: Partial<CarrierService>) =>
    updateService.mutate({ ...service, ...patch })

  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">Insurance</p>

      <div className="flex flex-col gap-6 w-full items-stretch">
        <DisplayToggle
          label="Supports Insurance"
          value={!!service.supports_insurance}
          onChange={(v) => handlePatch({ supports_insurance: v })}
        />

        <div className="flex flex-col gap-1">
          <Label htmlFor="max_declared_value" className="pl-1">
            Max Declared Value ($)
          </Label>
          <Input
            id="max_declared_value"
            type="number"
            inputMode="decimal"
            placeholder="$50,000..."
            className="text-left no-spinner"
            defaultValue={service.max_declared_value ?? ''}
            onBlur={(e) => {
              handlePatch({ max_declared_value: Number(e.target.value) ?? null })
            }}
          />
        </div>
      </div>
    </div>
  )
}

function Packaging({ service }: { service: CarrierService }) {
  const updateService = useUpdateCarrierService()
  const handlePatch = (patch: Partial<CarrierService>) =>
    updateService.mutate({ ...service, ...patch })

  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">Packaging</p>

      <div className="flex items-center items-stretch justify-center w-full">
        <div className="flex flex-col gap-1 w-full">
          <Label htmlFor="max_weight_lbs" className="pl-1">
            Max Weight (lbs)
          </Label>
          <Input
            id="max_weight_lbs"
            type="number"
            inputMode="decimal"
            placeholder="25 lb..."
            className="text-left no-spinner"
            defaultValue={service.max_weight_lbs ?? ''}
            onBlur={(e) => {
              handlePatch({ max_weight_lbs: Number(e.target.value) ?? null })
            }}
          />
        </div>

        <div className="hidden sm:block" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="max_length_in" className="pl-1">
            Max Length (in)
          </Label>
          <Input
            id="max_length_in"
            type="number"
            inputMode="decimal"
            placeholder="24 in..."
            className="text-left no-spinner"
            defaultValue={service.max_length_in ?? ''}
            onBlur={(e) => {
              handlePatch({ max_length_in: Number(e.target.value) ?? null })
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="max_width_in" className="pl-1">
            Max Width (in)
          </Label>
          <Input
            id="max_width_in"
            type="number"
            inputMode="decimal"
            placeholder="10 in..."
            className="text-left no-spinner"
            defaultValue={service.max_width_in ?? ''}
            onBlur={(e) => {
              handlePatch({ max_width_in: Number(e.target.value) ?? null })
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="max_height_in" className="pl-1">
            Max Height (in)
          </Label>
          <Input
            id="max_height_in"
            type="number"
            inputMode="decimal"
            placeholder="8 in..."
            className="text-left no-spinner"
            defaultValue={service.max_height_in ?? ''}
            onBlur={(e) => {
              handlePatch({ max_height_in: Number(e.target.value) ?? null })
            }}
          />
        </div>
      </div>
    </div>
  )
}
function Flags({ service }: { service: CarrierService }) {
  const updateService = useUpdateCarrierService()
  const handlePatch = (patch: Partial<CarrierService>) => {
    updateService.mutate({ ...service, ...patch })
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">Flags</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-6 items-stretch">
        <DisplayToggle
          label="International"
          value={!!service.is_international}
          onChange={(v) => handlePatch({ is_international: v })}
        />
        <DisplayToggle
          label="Residential"
          value={!!service.is_residential}
          onChange={(v) => handlePatch({ is_residential: v })}
        />
        <DisplayToggle
          label="Active"
          value={!!service.is_active}
          onChange={(v) => handlePatch({ is_active: v })}
        />
      </div>
    </div>
  )
}

function Dev({ service }: { service: CarrierService }) {
  const { data: services = [] } = useCarrierServicesByCarrier(service.carrier_id)

  const updateService = useUpdateCarrierService()
  const handlePatch = (patch: Partial<CarrierService>) => {
    updateService.mutate({ ...service, ...patch })
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">Dev</p>

      <DotSelect
        label="Display Order"
        count={services.length}
        value={service.display_order ?? 0}
        onChange={(n) => handlePatch({ display_order: n })}
        getLabel={(n) => n}
      />
    </div>
  )
}

function DangerZone({ service, onDone }: { service: CarrierService; onDone: () => void }) {
  const deleteService = useDeleteCarrierService()

  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow text-destructive">Danger Zone</p>

      <Button
        type="button"
        variant="secondary"
        intent="danger"
        disabled={deleteService.isPending}
        onClick={async () => {
          await deleteService.mutateAsync(service)
          onDone()
        }}
      >
        {deleteService.isPending ? 'Deleting...' : 'Delete Service'}
      </Button>
    </div>
  )
}

function Footer({ service }: { service: CarrierService }) {
  return (
    <div className="flex flex-col gap-2">
      <p>
        <small>
          Created on{' '}
          <strong>
            <time dateTime={machineDate(service.created_at)}>{formatFullDate(service.created_at)}</time>
          </strong>{' '}
          by <strong>{service.created_by || '—'}</strong>
        </small>
      </p>

      <p>
        <small>
          Updated on{' '}
          <strong>
            <time dateTime={machineDate(service.updated_at)}>{formatFullDate(service.updated_at)}</time>
          </strong>{' '}
          by <strong>{service.updated_by || '—'}</strong>
        </small>
      </p>
    </div>
  )
}
