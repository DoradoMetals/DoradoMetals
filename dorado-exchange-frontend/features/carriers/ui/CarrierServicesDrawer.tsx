'use client'

import { useMemo } from 'react'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { cn } from '@/shared/utils/cn'
import { formatFullDate } from '@/shared/utils/formatDates'

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
import { RadioGroupImage } from '@/shared/ui/RadioGroupImage'
import DotSelect from '@/shared/ui/DotSelect'
import { Button } from '@/shared/ui/base/button'
import Image from 'next/image'

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
    <Drawer open={isDrawerOpen} setOpen={closeDrawer} className="glass-panel">
      <Header service={service} carrier={carrier} />
      <div className="glass-divider" />
      <div className="space-y-8">
        <Details service={service} carriers={carriers} />
        <div className="glass-divider" />

        <Handoffs service={service} />
        <div className="glass-divider" />

        <Insurance service={service} />
        <div className="glass-divider" />

        <Packaging service={service} />
        <div className="glass-divider" />

        <TransitTime service={service} />
        <div className="glass-divider" />

        <Flags service={service} />
        <div className="glass-divider" />

        <Dev service={service} />
        <div className="glass-divider" />

        <DangerZone service={service} onDone={closeDrawer} />
        <div className="glass-divider" />

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
                  alt={`${carrier.name} logo`}
                  height={50}
                  width={50}
                  className="object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-md bg-muted" />
              )}
            </div>
            <div className="text-xl text-neutral-900">{service.name}</div>
          </div>
        </div>

        <div
          className={cn(
            'px-2 py-1 border-1 rounded-lg flex justify-center items-center font-semibold text-base',
            active
              ? 'bg-success/20 text-success border-success'
              : 'bg-destructive/20 text-destructive border-destructive'
          )}
        >
          {active ? 'Active' : 'Inactive'}
        </div>
      </div>

      <div className="flex w-full justify-start text-xs gap-1">
        <span className="text-neutral-600">Updated by</span>
        <span className="text-neutral-800">{service.updated_by}</span>
        <span className="text-neutral-600">on</span>
        <span className="text-neutral-800">{formatFullDate(service.updated_at)}</span>
      </div>
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
      <div className="section-label mb-4">Details</div>

      <div className="flex flex-col gap-2">
        <RadioGroupImage
          items={carriers.map((c) => ({
            id: c.id,
            name: c.name,
            logo: c.logo,
            is_active: c.is_active,
          }))}
          value={service.carrier_id}
          className="flex items-center w-full"
          buttonClass="border-1 bg-transparent border-neutral-400 has-[[data-state=checked]]:bg-success/10 has-[[data-state=checked]]:border-success"
          imageContainerClass="h-12"
          onValueChange={(id) => handlePatch({ carrier_id: id })}
          showName={false}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="name" className="text-xs pl-1 font-medium text-neutral-700">
          Service Name
        </Label>
        <Input
          id="name"
          placeholder="Enter service name..."
          type="text"
          className="on-glass"
          defaultValue={service.name ?? ''}
          onBlur={(e) => handlePatch({ name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="code" className="text-xs pl-1 font-medium text-neutral-700">
            Code
          </Label>
          <Input
            id="code"
            placeholder="UI code (e.g. Express Saver)"
            type="text"
            className="on-glass"
            defaultValue={service.code ?? ''}
            onBlur={(e) => handlePatch({ code: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="provider_code" className="text-xs pl-1 font-medium text-neutral-700">
            Provider Code
          </Label>
          <Input
            id="provider_code"
            placeholder="FedEx/UPS internal code..."
            type="text"
            className="on-glass"
            defaultValue={service.provider_code ?? ''}
            onBlur={(e) => handlePatch({ provider_code: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col w-full gap-1">
        <Label htmlFor="description" className="text-xs pl-1 font-medium text-neutral-700">
          Description
        </Label>
        <Textarea
          rows={10}
          id="description"
          placeholder="Enter service description..."
          className="on-glass min-w-70"
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
      <div className="section-label">Handoffs</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-6 items-stretch">
        <DisplayToggle
          label="Supports Pickup"
          value={!!service.supports_pickup}
          onChange={(v) => handlePatch({ supports_pickup: v })}
          onClass="success-on-glass rounded-l-lg"
          offClass="destructive-on-glass rounded-r-lg"
          groupClassName="rounded-none"
          inactiveClass="on-glass"
        />
        <DisplayToggle
          label="Supports Dropoff"
          value={!!service.supports_dropoff}
          onChange={(v) => handlePatch({ supports_dropoff: v })}
          onClass="success-on-glass rounded-l-lg"
          offClass="destructive-on-glass rounded-r-lg"
          groupClassName="rounded-none"
          inactiveClass="on-glass"
        />
        <DisplayToggle
          label="Supports Returns"
          value={!!service.supports_returns}
          onChange={(v) => handlePatch({ supports_returns: v })}
          onClass="success-on-glass rounded-l-lg"
          offClass="destructive-on-glass rounded-r-lg"
          groupClassName="rounded-none"
          inactiveClass="on-glass"
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
      <div className="section-label">Transit Time</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="min_transit_days" className="text-xs pl-1 font-medium text-neutral-700">
            Min Transit Days
          </Label>
          <Input
            id="min_transit_days"
            type="number"
            inputMode="numeric"
            placeholder="1 day..."
            className="on-glass text-left no-spinner"
            defaultValue={service.min_transit_days ?? ''}
            onBlur={(e) => {
              handlePatch({ min_transit_days: Number(e.target.value) ?? null })
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="max_transit_days" className="text-xs pl-1 font-medium text-neutral-700">
            Max Transit Days
          </Label>
          <Input
            id="max_transit_days"
            type="number"
            inputMode="numeric"
            placeholder="3 days..."
            className="on-glass text-left no-spinner"
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
      <div className="section-label">Insurance</div>

      <div className="flex flex-col gap-6 w-full items-stretch">
        <DisplayToggle
          label="Supports Insurance"
          value={!!service.supports_insurance}
          onChange={(v) => handlePatch({ supports_insurance: v })}
                    onClass="success-on-glass rounded-l-lg"
          offClass="destructive-on-glass rounded-r-lg"
          groupClassName="rounded-none"
          inactiveClass="on-glass"
        />

        <div className="flex flex-col gap-1">
          <Label htmlFor="max_declared_value" className="text-xs pl-1 font-medium text-neutral-700">
            Max Declared Value ($)
          </Label>
          <Input
            id="max_declared_value"
            type="number"
            inputMode="decimal"
            placeholder="$50,000..."
            className="on-glass text-left no-spinner"
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
      <div className="section-label">Packaging</div>

      <div className="flex items-center items-stretch justify-center w-full">
        <div className="flex flex-col gap-1 w-full">
          <Label htmlFor="max_weight_lbs" className="text-xs pl-1 font-medium text-neutral-700">
            Max Weight (lbs)
          </Label>
          <Input
            id="max_weight_lbs"
            type="number"
            inputMode="decimal"
            placeholder="25 lb..."
            className="on-glass text-left no-spinner"
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
          <Label htmlFor="max_length_in" className="text-xs pl-1 font-medium text-neutral-700">
            Max Length (in)
          </Label>
          <Input
            id="max_length_in"
            type="number"
            inputMode="decimal"
            placeholder="24 in..."
            className="on-glass text-left no-spinner"
            defaultValue={service.max_length_in ?? ''}
            onBlur={(e) => {
              handlePatch({ max_length_in: Number(e.target.value) ?? null })
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="max_width_in" className="text-xs pl-1 font-medium text-neutral-700">
            Max Width (in)
          </Label>
          <Input
            id="max_width_in"
            type="number"
            inputMode="decimal"
            placeholder="10 in..."
            className="on-glass text-left no-spinner"
            defaultValue={service.max_width_in ?? ''}
            onBlur={(e) => {
              handlePatch({ max_width_in: Number(e.target.value) ?? null })
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="max_height_in" className="text-xs pl-1 font-medium text-neutral-700">
            Max Height (in)
          </Label>
          <Input
            id="max_height_in"
            type="number"
            inputMode="decimal"
            placeholder="8 in..."
            className="on-glass text-left no-spinner"
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
      <div className="section-label">Flags</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-6 items-stretch">
        <DisplayToggle
          label="International"
          value={!!service.is_international}
          onChange={(v) => handlePatch({ is_international: v })}
                    onClass="success-on-glass rounded-l-lg"
          offClass="destructive-on-glass rounded-r-lg"
          groupClassName="rounded-none"
          inactiveClass="on-glass"
        />
        <DisplayToggle
          label="Residential"
          value={!!service.is_residential}
          onChange={(v) => handlePatch({ is_residential: v })}
                    onClass="success-on-glass rounded-l-lg"
          offClass="destructive-on-glass rounded-r-lg"
          groupClassName="rounded-none"
          inactiveClass="on-glass"
        />
        <DisplayToggle
          label="Active"
          value={!!service.is_active}
          onChange={(v) => handlePatch({ is_active: v })}
                    onClass="success-on-glass rounded-l-lg"
          offClass="destructive-on-glass rounded-r-lg"
          groupClassName="rounded-none"
          inactiveClass="on-glass"
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
  console.log(services)
  return (
    <div className="flex flex-col gap-6">
      <div className="section-label">Dev</div>

      <DotSelect
        label="Display Order"
        count={services.length}
        value={service.display_order ?? 0}
        onChange={(n) => handlePatch({ display_order: n })}
        getLabel={(n) => n}
        buttonClass="h-10 rounded-lg border text-sm font-medium"
        checkedClass="success-on-glass"
        defaultClass="on-glass"
      />
    </div>
  )
}

function DangerZone({ service, onDone }: { service: CarrierService; onDone: () => void }) {
  const deleteService = useDeleteCarrierService()

  return (
    <div className="flex flex-col gap-6">
      <div className="section-label text-destructive">Danger Zone</div>

      <Button
        type="button"
        variant="destructive"
        className={cn('destructive-on-glass hover:bg-destructive/30!')}
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
      <div className="flex items-center gap-1 text-xs text-neutral-600">
        <span className="text-neutral-600">Created on</span>{' '}
        <span className="font-medium text-neutral-800">{formatFullDate(service.created_at)}</span>
        <span className="text-neutral-600">by</span>
        <span className="font-medium text-neutral-800">{service.created_by || '—'}</span>
      </div>

      <div className="flex items-center gap-1 text-xs text-neutral-600">
        <span className="text-neutral-600">Updated on</span>{' '}
        <span className="font-medium text-neutral-800">{formatFullDate(service.updated_at)}</span>
        <span className="text-neutral-600">by</span>
        <span className="font-medium text-neutral-800">{service.updated_by || '—'}</span>
      </div>
    </div>
  )
}
