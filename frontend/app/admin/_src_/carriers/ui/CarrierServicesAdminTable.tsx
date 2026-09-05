'use client'

import { useMemo, useState } from 'react'
import { Rows3 } from '@dorado/icons'

import { Badge, Button, DataTable, RadioGroup, RadioOption, type DataTableColumn } from '@dorado/components'
import Image from 'next/image'

import { useDrawerStore } from '@/shared/store/drawerStore'
import {
  useCarriers,
  useCarrierServices,
  useCreateCarrierService,
} from '../queries'
import type { Carrier, CarrierService } from '../types'
import CarrierServiceDrawer from './CarrierServicesDrawer'
import { AddNewDialog, CreateConfig } from '../../ui/CreateDialog'

export default function CarrierServicesPage() {
  const { data: carriers = [] } = useCarriers()
  const { data: services = [] } = useCarrierServices()
  const createService = useCreateCarrierService()

  const { openDrawer } = useDrawerStore()
  const [activeService, setActiveService] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const carrierById = useMemo(() => {
    const map = new Map<string, Carrier>()
    for (const c of carriers) map.set(c.id, c)
    return map
  }, [carriers])

  const columns: DataTableColumn<CarrierService>[] = [
    {
      id: 'carrier_logo',
      header: '',
      cell: ({ row }) => {
        const carrier = carrierById.get(row.original.carrier_id ?? '')
        const logo = (carrier?.logo ?? '').trim()
        const alt = `${carrier?.organization.name ?? 'Carrier'} logo`
        if (!logo) return <div className="size-10 rounded-md border border-border bg-muted" />
        return (
          <img
            src={logo}
            alt={alt}
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
            className="rounded-md object-contain"
          />
        )
      },
    },
    {
      id: 'name',
      header: 'Service',
      accessorKey: 'name',
      meta: { primary: true },
      enableSorting: true,
    },
    {
      id: 'code',
      header: 'Code',
      accessorKey: 'code',
    },
    {
      id: 'is_active',
      header: () => <span className="flex w-full justify-center">Active</span>,
      cell: ({ row }) => {
        const active = !!row.original.is_active
        return (
          <span className="flex justify-center">
            <Badge intent={active ? 'success' : 'danger'}>{active ? 'Active' : 'Inactive'}</Badge>
          </span>
        )
      },
    },
  ]

  const createConfig: CreateConfig = {
    title: 'Create A New Carrier Service',
    submitLabel: 'Create Service',
    fields: [
      {
        name: 'carrier_id',
        label: '',
        render: ({ value, setValue }) => (
          <RadioGroup
            value={value}
            onValueChange={(id) => setValue('carrier_id', id)}
            className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {carriers.map((c) => (
              <RadioOption
                key={c.id}
                value={c.id}
                variant="tile"
                disabled={!c.organization.enabled}
              >
                <div className="relative flex h-20 w-full items-center justify-center">
                  <Image
                    src={c.logo ?? ''}
                    fill
                    alt={`${c.organization.name ?? ''} logo`}
                    className="object-contain p-1"
                  />
                </div>
                <strong>{c.organization.name}</strong>
              </RadioOption>
            ))}
          </RadioGroup>
        ),
      },
      { name: 'name', label: 'Name', inputType: 'text' },
    ],

    createNew: async (values: Record<string, string>) => {
      const carrier_id = (values.carrier_id ?? '').trim()
      const name = (values.name ?? '').trim()

      await createService.mutateAsync({
        carrier_id,
        name,
      })
    },

    canSubmit: (values) =>
      (values.carrier_id ?? '').trim().length > 0 && (values.name ?? '').trim().length > 0,
  }
  const handleRowClick = (row: CarrierService) => {
    setActiveService(row.id)
    openDrawer('carrierServices')
  }

  return (
    <>
      <DataTable<CarrierService>
        label="Carrier services"
        data={services}
        columns={columns}
        getRowId={(row) => row.id}
        searchable
        searchPlaceholder="Search services..."
        onRowClick={handleRowClick}
        pageSize={12}
        actions={
          <>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              aria-label="Create Carrier Service"
              title="Create Carrier Service"
            >
              <Rows3 size={28} />
            </Button>
            <AddNewDialog open={createOpen} onOpenChange={setCreateOpen} createConfig={createConfig} />
          </>
        }
      />

      {activeService && (
        <CarrierServiceDrawer service_id={activeService} services={services} carriers={carriers} />
      )}
    </>
  )
}
