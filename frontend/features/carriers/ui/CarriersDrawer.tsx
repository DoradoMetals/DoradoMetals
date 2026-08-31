'use client'

import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { useMemo, useState } from 'react'
import { formatFullDate } from '@/shared/utils/formatDates'
import { Input } from '@/shared/ui/base/input'
import { SegmentedField } from '@/shared/ui/SegmentedField'
import StatusChip from '@/shared/ui/StatusChip'
import UpdatedByline from '@/shared/ui/UpdatedByline'
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
import { Button } from '@dorado/components'
import { Field } from '@/shared/ui/Field'

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

        <StatusChip positive={active} size="lg" className="h-fit">
          {active ? 'Active' : 'Inactive'}
        </StatusChip>
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

      <Field label="Name" htmlFor="carrier_name">
        <Input
          id="carrier_name"
          placeholder="Carrier name..."
          type="text"
          defaultValue={carrier.organization.name ?? ''}
          onBlur={(e) => handleOrgUpdate({ name: e.target.value })}
        />
      </Field>

      <Field label="Logo" htmlFor="carrier_logo">
        <Input
          id="carrier_logo"
          placeholder="/logos/fedex.svg or https://..."
          type="text"
          defaultValue={carrier.logo ?? ''}
          onBlur={(e) => updateCarrier.mutate({ ...carrier, logo: e.target.value })}
        />
      </Field>
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

      <Field label="Email" htmlFor="carrier_email">
        <Input
          id="carrier_email"
          placeholder="support@carrier.com"
          type="text"
          defaultValue={carrier.organization.email ?? ''}
          onBlur={(e) => handleOrgUpdate({ email: e.target.value })}
        />
      </Field>

      <Field label="Phone" htmlFor="carrier_phone">
        <Input
          id="carrier_phone"
          placeholder="(555) 555-5555"
          type="text"
          defaultValue={formatPhoneNumber(carrier.organization.phone ?? '')}
          onBlur={(e) => handleOrgUpdate({ phone: normalizePhone(e.target.value) })}
        />
      </Field>
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
        )
      },
    }),
  ]

  return (
    <div className="space-y-3">
      <p className="eyebrow">Services</p>

      <DataTable<CarrierService>
        data={services}
        columns={columns}
        initialPageSize={8}
        showCardBackground={false}
        hidePagination={true}
        wrapperClassName="p-1 bg-transparent"
        showHeaders={false}
        getRowClassName={() => 'cursor-default'}
      />
    </div>
  )
}
