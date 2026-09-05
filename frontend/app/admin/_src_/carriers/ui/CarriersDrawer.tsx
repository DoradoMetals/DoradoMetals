'use client'

import { useState } from 'react'

import {
  Badge,
  Button,
  DataTable,
  Drawer,
  Input,
  Switch,
  type DataTableColumn,
} from '@dorado/components'

import { useDrawerRecord } from '../../hooks/useDrawerRecord'
import { formatFullDate } from '@/shared/utils/formatDates'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'

import type { Carrier, CarrierService } from '../types'
import { useCarrierServicesByCarrier, useUpdateCarrier, useUpdateCarrierService } from '../queries'

export default function CarriersDrawer({
  carriers,
  carrier_id,
}: {
  carriers: Carrier[]
  carrier_id: string
}) {
  const { open, record: carrier, close } = useDrawerRecord('carriers', carriers, carrier_id)
  const updateCarrier = useUpdateCarrier()

  if (!carrier) return null

  const handleUpdate = (patch: Partial<Carrier>) => {
    updateCarrier.mutate({ ...carrier, ...patch })
  }

  const handleOrgUpdate = (patch: Partial<Carrier['organization']>) => {
    handleUpdate({ organization: { ...carrier.organization, ...patch } })
  }

  return (
    <Drawer open={open} setOpen={close}>
      <Header carrier={carrier} />
      <hr />
      <div className="space-y-8">
        <Status carrier={carrier} onOrgUpdate={handleOrgUpdate} />
        <hr />
        <Details carrier={carrier} onUpdate={handleUpdate} onOrgUpdate={handleOrgUpdate} />
        <hr />
        <Contact carrier={carrier} onOrgUpdate={handleOrgUpdate} />
        <hr />
        <Services carrier={carrier} />
        <hr />
      </div>
    </Drawer>
  )
}

function Header({ carrier }: { carrier: Carrier }) {
  const active = !!carrier.organization.enabled
  const logo = (carrier.logo ?? '').trim()

  return (
    <div className="flex flex-col w-full gap-6">
      <div className="flex w-full items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          {logo ? (
            <img
              src={logo ?? ''}
              alt={`${carrier.organization.name} logo`}
              height={100}
              width={100}
            />
          ) : (
            <h2>{carrier.organization.name}</h2>
          )}
        </div>

        <Badge intent={active ? 'success' : 'danger'} size="lg" className="h-fit">
          {active ? 'Active' : 'Inactive'}
        </Badge>
      </div>
    </div>
  )
}

function Details({
  carrier,
  onUpdate,
  onOrgUpdate,
}: {
  carrier: Carrier
  onUpdate: (patch: Partial<Carrier>) => void
  onOrgUpdate: (patch: Partial<Carrier['organization']>) => void
}) {
  return (
    <div className="flex flex-col w-full gap-4">
      <p className="eyebrow mb-4">Details</p>

      <Input
        id="carrier_name"
        label="Name"
        placeholder="Carrier name..."
        type="text"
        defaultValue={carrier.organization.name ?? ''}
        onBlur={(e) => onOrgUpdate({ name: e.target.value })}
      />

      <Input
        id="carrier_logo"
        label="Logo"
        placeholder="/logos/fedex.svg or https://..."
        type="text"
        defaultValue={carrier.logo ?? ''}
        onBlur={(e) => onUpdate({ logo: e.target.value })}
      />
    </div>
  )
}
function Contact({
  carrier,
  onOrgUpdate,
}: {
  carrier: Carrier
  onOrgUpdate: (patch: Partial<Carrier['organization']>) => void
}) {
  return (
    <div className="flex flex-col w-full gap-4">
      <p className="eyebrow mb-4">Contact</p>

      <Input
        id="carrier_email"
        label="Email"
        placeholder="support@carrier.com"
        type="text"
        defaultValue={carrier.organization.email ?? ''}
        onBlur={(e) => onOrgUpdate({ email: e.target.value })}
      />

      <Input
        id="carrier_phone"
        label="Phone"
        placeholder="(555) 555-5555"
        type="text"
        defaultValue={formatPhoneNumber(carrier.organization.phone ?? '')}
        onBlur={(e) => onOrgUpdate({ phone: normalizePhone(e.target.value) })}
      />
    </div>
  )
}

function Status({
  carrier,
  onOrgUpdate,
}: {
  carrier: Carrier
  onOrgUpdate: (patch: Partial<Carrier['organization']>) => void
}) {
  return (
    <div className="flex items-center justify-center w-full">
      <div className="flex flex-col gap-4 w-full">
        <p className="eyebrow">Active</p>

        <Switch
          label="Accepting shipments"
          checked={!!carrier.organization.enabled}
          onCheckedChange={(v) => onOrgUpdate({ enabled: v })}
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

  const columns: DataTableColumn<CarrierService>[] = [
    {
      id: 'name',
      header: 'Service',
      accessorKey: 'name',
      meta: { primary: true },
    },
    {
      id: 'transit',
      header: 'Transit',
      cell: ({ row }) => {
        const min = row.original.min_transit_days
        const max = row.original.max_transit_days

        if (min == null && max == null) return '—'
        if (min != null && max != null) return `${min}–${max} days`
        if (min != null) return `${min}+ days`
        return `≤ ${max} days`
      },
    },
    {
      id: 'is_active',
      header: () => <span className="flex w-full justify-center">Active</span>,
      cell: ({ row }) => {
        const svc = row.original
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
          <span className="flex justify-center">
            <Button
              variant="secondary"
              intent={active ? 'danger' : 'success'}
              size="xs"
              onClick={(e) => {
                e.stopPropagation()
                toggleActive(svc)
              }}
              disabled={isThisPending}
              className="min-w-24"
            >
              {label}
            </Button>
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-3">
      <p className="eyebrow">Services</p>

      <DataTable<CarrierService>
        label={`${carrier.organization.name ?? 'Carrier'} services`}
        data={services}
        columns={columns}
        getRowId={(row) => row.id}
      />
    </div>
  )
}
