'use client'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo, useState } from 'react'
import { formatFullDate } from '@/shared/utils/formatDates'
import { cn } from '@/shared/utils/cn'
import { Label } from '@/shared/ui/base/label'
import { Input } from '@/shared/ui/base/input'
import { DisplayToggle } from '@/shared/ui/DisplayToggle'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'

import type { Carrier, CarrierService } from '@/features/carriers/types'
import {
  useCarrierServicesByCarrier,
  useUpdateCarrier,
  useUpdateCarrierService,
} from '@/features/carriers/queries'
import { ColumnDef } from '@tanstack/react-table'
import { ChipColumn, IconColumn, TextColumn } from '@/shared/ui/table/Columns'
import { DataTable } from '@/shared/ui/table/Table'
import { Button } from '@/shared/ui/base/button'

export default function CarriersDrawer({
  carriers,
  carrier_id,
}: {
  carriers: Carrier[]
  carrier_id: string
}) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'carriers'

  const carrier = useMemo(() => carriers.find((c) => c.id === carrier_id), [carriers, carrier_id])

  if (!carrier) return null

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer} className="glass-panel">
      <Header carrier={carrier} />
      <div className="glass-divider" />
      <div className="space-y-8">
        <Status carrier={carrier} />
        <div className="glass-divider" />
        <Details carrier={carrier} />
        <div className="glass-divider" />
        <Contact carrier={carrier} />
        <div className="glass-divider" />
        <Services carrier={carrier} />
        <div className="glass-divider" />
      </div>
    </Drawer>
  )
}

function Header({ carrier }: { carrier: Carrier }) {
  const active = !!carrier.is_active
  const logo = (carrier.logo ?? '').trim()

  return (
    <div className="flex flex-col w-full gap-6">
      <div className="flex w-full items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          {logo ? (
            <img src={logo ?? ''} alt={`${carrier.name} logo`} height={100} width={100} />
          ) : (
            <div className="text-xl text-neutral-900">{carrier.name}</div>
          )}
        </div>

        <div
          className={cn(
            'px-2 py-1 border-1 rounded-lg flex justify-center items-center font-semibold text-base h-fit',
            active
              ? 'bg-success/20 text-success border-success'
              : 'bg-destructive/20 text-destructive border-destructive'
          )}
        >
          {active ? 'Active' : 'Inactive'}
        </div>
      </div>

      <div className="flex w-full justify-start text-xs gap-1">
        <span className="text-neutral-600">Updated</span>
        <span className="text-neutral-600">on</span>
        <span className="text-neutral-800">{formatFullDate(carrier.updated_at)}</span>
      </div>
    </div>
  )
}

function Details({ carrier }: { carrier: Carrier }) {
  const updateCarrier = useUpdateCarrier()

  const handleUpdate = (patch: Partial<Carrier>) => {
    updateCarrier.mutate({ ...carrier, ...patch })
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <div className="section-label mb-4">Details</div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="carrier_name" className="text-xs pl-1 font-medium text-neutral-700">
          Name
        </Label>
        <Input
          id="carrier_name"
          placeholder="Carrier name..."
          type="text"
          className="on-glass"
          defaultValue={carrier.name ?? ''}
          onBlur={(e) => handleUpdate({ name: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="carrier_logo" className="text-xs pl-1 font-medium text-neutral-700">
          Logo
        </Label>
        <Input
          id="carrier_logo"
          placeholder="/logos/fedex.svg or https://..."
          type="text"
          className="on-glass"
          defaultValue={carrier.logo ?? ''}
          onBlur={(e) => handleUpdate({ logo: e.target.value })}
        />
      </div>
    </div>
  )
}
function Contact({ carrier }: { carrier: Carrier }) {
  const updateCarrier = useUpdateCarrier()

  const handleUpdate = (patch: Partial<Carrier>) => {
    updateCarrier.mutate({ ...carrier, ...patch })
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <div className="section-label mb-4">Contact</div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="carrier_email" className="text-xs pl-1 font-medium text-neutral-700">
          Email
        </Label>
        <Input
          id="carrier_email"
          placeholder="support@carrier.com"
          type="text"
          className="on-glass"
          defaultValue={carrier.email ?? ''}
          onBlur={(e) => handleUpdate({ email: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="carrier_phone" className="text-xs pl-1 font-medium text-neutral-700">
          Phone
        </Label>
        <Input
          id="carrier_phone"
          placeholder="(555) 555-5555"
          type="text"
          className="on-glass "
          defaultValue={formatPhoneNumber(carrier.phone ?? '')}
          onBlur={(e) => handleUpdate({ phone: normalizePhone(e.target.value) })}
        />
      </div>
    </div>
  )
}

function Status({ carrier }: { carrier: Carrier }) {
  const updateCarrier = useUpdateCarrier()

  const handleUpdate = (patch: Partial<Carrier>) => {
    updateCarrier.mutate({ ...carrier, ...patch })
  }

  return (
    <div className="flex items-center justify-center w-full">
      <div className="flex flex-col gap-4 w-full">
        <div className="section-label">Active</div>

        <DisplayToggle
          label=""
          value={!!carrier.is_active}
          onChange={(v) => handleUpdate({ is_active: v })}
          onClass="success-on-glass rounded-l-lg"
          offClass="destructive-on-glass rounded-r-lg"
          groupClassName="rounded-none"
          inactiveClass="on-glass"
        />
      </div>
    </div>
  )
}

function Services({ carrier }: { carrier: Carrier }) {
  const { data: services = [] } = useCarrierServicesByCarrier(carrier.id)
  const updateService = useUpdateCarrierService()

  const [pending, setPending] = useState<{ id: string; next: boolean } | null>(null)

  const toggleActive = async (svc: CarrierService) => {
    const next = !svc.is_active
    setPending({ id: svc.id, next })

    try {
      await updateService.mutateAsync({ ...svc, is_active: next })
    } finally {
      setPending(null)
    }
  }
  const columns: ColumnDef<CarrierService>[] = [
    TextColumn<CarrierService>({
      id: 'name',
      header: 'Service',
      accessorKey: 'name',
      enableHiding: false,
      size: 260,
    }),

    TextColumn<CarrierService>({
      id: 'transit',
      header: 'Transit',
      accessorKey: 'id',
      enableHiding: true,
      size: 160,
      formatValue: (_value, row) => {
        const min = row.min_transit_days
        const max = row.max_transit_days

        if (min == null && max == null) return '—'
        if (min != null && max != null) return `${min}–${max} days`
        if (min != null) return `${min}+ days`
        return `≤ ${max} days`
      },
    }),

    IconColumn<CarrierService>({
      id: 'is_active',
      header: 'Active',
      accessorKey: 'is_active',
      align: 'center',
      enableHiding: true,
      size: 120,
      renderIcon: ({ row }) => {
        const svc = row as CarrierService
        const active = !!svc.is_active

        const isThisPending = pending?.id === svc.id
        const label = isThisPending
          ? pending!.next
            ? 'Enabling...'
            : 'Disabling...'
          : active
          ? 'Disable'
          : 'Enable'

        return (
          <Button
            variant="default"
            onClick={(e) => {
              e.stopPropagation()
              toggleActive(svc)
            }}
            disabled={isThisPending}
            className={cn(
              'cursor-pointer shadow-lg min-w-24 px-2 py-0 border rounded-lg text-xs font-semibold inline-flex items-center justify-center',
              active
                ? 'destructive-on-glass'
                : 'success-on-glass',
              isThisPending && 'opacity-60 cursor-not-allowed'
            )}
          >
            {label}
          </Button>
        )
      },
    }),
  ]

  return (
    <div className="space-y-3">
      <div className="section-label">Services</div>

      <DataTable<CarrierService>
        data={services}
        columns={columns}
        initialPageSize={8}
        showCardBackground={false}
        hidePagination={true}
        searchClass="on-glass"
        shadowClass="shadow-none"
        wrapperClassName="p-1 on-glass"
        showHeaders={false}
        getRowClassName={() => 'hover:cursor-default'}
      />
    </div>
  )
}
