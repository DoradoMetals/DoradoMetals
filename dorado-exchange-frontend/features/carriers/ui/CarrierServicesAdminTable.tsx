'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { TextColumn, ChipColumn, ImageColumn } from '@/shared/ui/table/Columns'
import { DataTable } from '@/shared/ui/table/Table'
import { CreateConfig } from '@/shared/ui/table/AddNew'

import {
  useCarriers,
  useCarrierServices,
  useCreateCarrierService,
} from '@/features/carriers/queries'
import type { Carrier, CarrierService } from '@/features/carriers/types'
import { RadioGroupImage } from '@/shared/ui/RadioGroupImage'
import CarrierServiceDrawer from '@/features/carriers/ui/CarrierServicesDrawer'

export default function CarrierServicesPage() {
  const { data: carriers = [] } = useCarriers()
  const { data: services = [] } = useCarrierServices()
  const createService = useCreateCarrierService()

  const { openDrawer } = useDrawerStore()
  const [activeService, setActiveService] = React.useState<string | null>(null)

  const carrierById = React.useMemo(() => {
    const map = new Map<string, Carrier>()
    for (const c of carriers) map.set(c.id, c)
    return map
  }, [carriers])

  const carrierFilterCards = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of services) {
      counts.set(s.carrier_id, (counts.get(s.carrier_id) ?? 0) + 1)
    }

    return carriers.map((c) => {
      const count = counts.get(c.id) ?? 0
      const logo = (c.logo ?? '').trim()

      return {
        key: c.id,
        filter: c.id,
        header: c.name,
        label: `${count} services`,
        predicate: (row: CarrierService) => row.carrier_id === c.id,

        IconNode: logo ? (
          <div className="relative flex h-16 pl-3">
            <img
              src={logo}
              alt={`${c.name} logo`}
              height={100}
              width={100}
              className="object-contain"
            />
          </div>
        ) : (
          <div className="" />
        ),
      }
    })
  }, [carriers, services])

  const columns: ColumnDef<CarrierService>[] = [
    ImageColumn<CarrierService>({
      id: 'carrier_logo',
      header: '',
      accessorKey: 'carrier_id',
      align: 'left',
      enableHiding: true,
      size: 56,
      height: 40,
      width: 40,
      rounded: 'md',

      getSrc: ({ value }) => {
        const carrierId = String(value ?? '')
        return carrierById.get(carrierId)?.logo ?? ''
      },
      getAlt: ({ value }) => {
        const carrierId = String(value ?? '')
        const name = carrierById.get(carrierId)?.name ?? 'Carrier'
        return `${name} logo`
      },
    }),

    TextColumn<CarrierService>({
      id: 'name',
      header: 'Service',
      accessorKey: 'name',
      enableHiding: false,
      size: 260,
    }),

    TextColumn<CarrierService>({
      id: 'code',
      header: 'Code',
      accessorKey: 'code',
      enableHiding: true,
      headerClassName: 'hidden md:flex',
      cellClassName: 'hidden md:flex',
      size: 180,
    }),

    TextColumn<CarrierService>({
      id: 'delivery_speed',
      header: 'Speed',
      accessorKey: 'delivery_speed',
      enableHiding: true,
      headerClassName: 'hidden lg:flex',
      cellClassName: 'hidden lg:flex',
      formatValue: (v) => (v ? String(v) : '-'),
      size: 140,
    }),

    ChipColumn<CarrierService>({
      id: 'is_active',
      header: 'Active',
      accessorKey: 'is_active',
      align: 'center',
      enableHiding: true,
      size: 120,
      getChip: ({ row }) => {
        const svc = row as CarrierService
        const active = !!svc.is_active
        return {
          label: active ? 'Active' : 'Inactive',
          className: active
            ? 'bg-success/20 text-success border-success'
            : 'bg-destructive/20 text-destructive border-destructive',
        }
      },
    }),
  ]

  const createConfig: CreateConfig = {
    title: 'Create A New Carrier Service',
    submitLabel: 'Create Service',
    fields: [
      {
        name: 'carrier_id',
        label: '',
        render: ({ value, setValue }) => (
          <RadioGroupImage
            items={carriers.map((c) => ({
              id: c.id,
              name: c.name,
              logo: c.logo,
              is_active: c.is_active,
            }))}
            value={value}
            onValueChange={(id) => setValue('carrier_id', id)}
          />
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
  const handleRowClick = (row: Row<CarrierService>) => {
    setActiveService(row.original.id)
    openDrawer('carrierServices')
  }

  return (
    <>
      <DataTable<CarrierService>
        data={services}
        columns={columns}
        initialPageSize={12}
        searchColumnId="name"
        searchPlaceholder="Search services..."
        enableColumnVisibility
        onRowClick={handleRowClick}
        getRowClassName={() => 'hover:bg-background hover:cursor-pointer'}
        filterCards={carrierFilterCards}
        createConfig={createConfig}
      />

      {activeService && (
        <CarrierServiceDrawer service_id={activeService} services={services} carriers={carriers} />
      )}
    </>
  )
}
