'use client'

import { useMemo, useState } from 'react'

import { Badge, Button, DataTable, Drawer, Input, type DataTableColumn } from '@dorado/components'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { formatFullDate } from '@/shared/utils/formatDates'
import { SegmentedField } from '@/shared/ui/SegmentedField'
import UpdatedByline from '@/shared/ui/UpdatedByline'
import formatPhoneNumber, { normalizePhone } from '@/shared/utils/formatPhoneNumber'

import type { Carrier, CarrierService } from '@/features/carriers/types'
import {
  useCarrierServicesByCarrier,
  useUpdateCarrier,
  useUpdateCarrierService,
} from '@/features/carriers/queries'

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
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <Header carrier={carrier} />
      <hr />
      <div className="space-y-8">
        <Status carrier={carrier} />
        <hr />
        <Details carrier={carrier} />
        <hr />
        <Contact carrier={carrier} />
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
            <img src={logo ?? ''} alt={`${carrier.organization.name} logo`} height={100} width={100} />
          ) : (
            <h2>{carrier.organization.name}</h2>
          )}
        </div>

        <Badge intent={active ? 'success' : 'danger'} size="lg" className="h-fit">
          {active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <UpdatedByline date={formatFullDate(carrier.updated_at ?? '')} />
    </div>
  )
}

function Details({ carrier }: { carrier: Carrier }) {
  const updateCarrier = useUpdateCarrier()

  // The identity fields live on the organization; a patch to one of them
  // rebuilds the nested object the API stores.
  const handleOrgUpdate = (patch: Partial<Carrier['organization']>) => {
    updateCarrier.mutate({ ...carrier, organization: { ...carrier.organization, ...patch } })
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <p className="eyebrow mb-4">Details</p>

      <Input
        id="carrier_name"
        label="Name"
        placeholder="Carrier name..."
        type="text"
        defaultValue={carrier.organization.name ?? ''}
        onBlur={(e) => handleOrgUpdate({ name: e.target.value })}
      />

      <Input
        id="carrier_logo"
        label="Logo"
        placeholder="/logos/fedex.svg or https://..."
        type="text"
        defaultValue={carrier.logo ?? ''}
        onBlur={(e) => updateCarrier.mutate({ ...carrier, logo: e.target.value })}
      />
    </div>
  )
}
function Contact({ carrier }: { carrier: Carrier }) {
  const updateCarrier = useUpdateCarrier()

  const handleOrgUpdate = (patch: Partial<Carrier['organization']>) => {
    updateCarrier.mutate({ ...carrier, organization: { ...carrier.organization, ...patch } })
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <p className="eyebrow mb-4">Contact</p>

      <Input
        id="carrier_email"
        label="Email"
        placeholder="support@carrier.com"
        type="text"
        defaultValue={carrier.organization.email ?? ''}
        onBlur={(e) => handleOrgUpdate({ email: e.target.value })}
      />

      <Input
        id="carrier_phone"
        label="Phone"
        placeholder="(555) 555-5555"
        type="text"
        defaultValue={formatPhoneNumber(carrier.organization.phone ?? '')}
        onBlur={(e) => handleOrgUpdate({ phone: normalizePhone(e.target.value) })}
      />
    </div>
  )
}

function Status({ carrier }: { carrier: Carrier }) {
  const updateCarrier = useUpdateCarrier()

  const handleOrgUpdate = (patch: Partial<Carrier['organization']>) => {
    updateCarrier.mutate({ ...carrier, organization: { ...carrier.organization, ...patch } })
  }

  return (
    <div className="flex items-center justify-center w-full">
      <div className="flex flex-col gap-4 w-full">
        <p className="eyebrow">Active</p>

        <SegmentedField
          label="Accepting shipments"
          value={!!carrier.organization.enabled}
          onChange={(v) => handleOrgUpdate({ enabled: v })}
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
