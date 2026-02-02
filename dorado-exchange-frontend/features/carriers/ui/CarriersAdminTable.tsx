'use client'
import { useState } from 'react'

import { ColumnDef, Row } from '@tanstack/react-table'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { TextColumn, ChipColumn, ImageColumn } from '@/shared/ui/table/Columns'
import { DataTable } from '@/shared/ui/table/Table'

import { useCarriers, useCreateCarrier } from '@/features/carriers/queries'
import { Carrier } from '@/features/carriers/types'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import CarriersDrawer from '@/features/carriers/ui/CarriersDrawer'
import { CreateConfig } from '@/shared/ui/table/CreateDialog'

export default function CarriersPage() {
  const { data: carriers = [] } = useCarriers()
  const createCarrier = useCreateCarrier()
  const { openDrawer } = useDrawerStore()
  const [activeCarrier, setActiveCarrier] = useState<string | null>(null)

  const columns: ColumnDef<Carrier>[] = [
    TextColumn<Carrier>({
      id: 'name',
      header: 'Name',
      accessorKey: 'name',
      enableHiding: false,
      size: 260,
    }),
    ImageColumn<Carrier>({
      id: 'logo',
      header: 'Logo',
      accessorKey: 'logo',
      align: 'left',
      enableHiding: true,
      height: 50,
      width: 50,
      rounded: 'md',
      getAlt: ({ row }) => `${row.name} logo`,
      size: 50,
    }),
    TextColumn<Carrier>({
      id: 'phone',
      header: 'Phone',
      accessorKey: 'phone',
      align: 'left',
      enableHiding: true,
      headerClassName: 'hidden lg:flex',
      cellClassName: 'hidden lg:flex',
      textClassName: 'text-xs sm:text-sm text-neutral-900',
      formatValue: (value) => formatPhoneNumber(String(value ?? '')),
      size: 170,
    }),
    ChipColumn<Carrier>({
      id: 'is_active',
      header: 'Status',
      accessorKey: 'is_active',
      align: 'center',
      enableHiding: true,
      size: 130,
      getChip: ({ row }) => {
        const carrier = row as Carrier
        const active = !!carrier.is_active
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
    title: 'Create New Carrier',
    submitLabel: 'Create Carrier',
    fields: [{ name: 'name', label: 'Name', inputType: 'text' }],
    createNew: async (values: Record<string, string>) => {
      const name = (values.name ?? '').trim()

      await createCarrier.mutateAsync({
        id: '',
        name,
        email: '',
        phone: '',
        logo: '',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as Carrier)
    },
    canSubmit: (values: Record<string, string>) => (values.name ?? '').trim().length > 0,
  }

  const handleRowClick = (row: Row<Carrier>) => {
    setActiveCarrier(row.original.id)
    openDrawer('carriers')
  }

  return (
    <>
      <DataTable<Carrier>
        data={carriers}
        columns={columns}
        initialPageSize={12}
        searchColumnId="name"
        searchPlaceholder="Search carriers..."
        enableColumnVisibility
        wrapperClassName='glass-card'
        shadowClass=''
        showCardBackground={false}
        onRowClick={handleRowClick}
        getRowClassName={() => 'hover:bg-background hover:cursor-pointer'}
        createConfig={createConfig}

      />

      {activeCarrier && <CarriersDrawer carrier_id={activeCarrier} carriers={carriers} />}
    </>
  )
}
