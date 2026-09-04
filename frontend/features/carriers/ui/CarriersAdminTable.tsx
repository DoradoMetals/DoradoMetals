'use client'
import { useState } from 'react'

import { RowsPlusTopIcon } from '@phosphor-icons/react'
import { Badge, Button, DataTable, type DataTableColumn } from '@dorado/components'

import { useDrawerStore } from '@/shared/store/drawerStore'
import { useCarriers, useCreateCarrier } from '@/features/carriers/queries'
import { Carrier } from '@/features/carriers/types'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import CarriersDrawer from '@/features/carriers/ui/CarriersDrawer'
import { AddNewDialog, CreateConfig } from '@/shared/ui/CreateDialog'

export default function CarriersPage() {
  const { data: carriers = [] } = useCarriers()
  const createCarrier = useCreateCarrier()
  const { openDrawer } = useDrawerStore()
  const [activeCarrier, setActiveCarrier] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const columns: DataTableColumn<Carrier>[] = [
    {
      id: 'name',
      header: 'Name',
      accessorFn: (row) => row.organization.name ?? '',
      meta: { primary: true },
      enableSorting: true,
    },
    {
      id: 'logo',
      header: 'Logo',
      cell: ({ row }) => {
        const logo = (row.original.logo ?? '').trim()
        const alt = `${row.original.organization.name ?? ''} logo`
        if (!logo) return <div className="size-12.5 rounded-md border border-border bg-muted" />
        return (
          <img
            src={logo}
            alt={alt}
            width={50}
            height={50}
            loading="lazy"
            decoding="async"
            className="rounded-md object-contain"
          />
        )
      },
    },
    {
      id: 'phone',
      header: 'Phone',
      accessorFn: (row) => row.organization.phone ?? '',
      cell: ({ getValue }) => formatPhoneNumber(String(getValue() ?? '')),
    },
    {
      id: 'is_active',
      header: () => <span className="flex w-full justify-center">Status</span>,
      cell: ({ row }) => {
        const active = !!row.original.organization.enabled
        return (
          <span className="flex justify-center">
            <Badge intent={active ? 'success' : 'danger'}>{active ? 'Active' : 'Inactive'}</Badge>
          </span>
        )
      },
    },
  ]

  const createConfig: CreateConfig = {
    title: 'Create New Carrier',
    submitLabel: 'Create Carrier',
    fields: [{ name: 'name', label: 'Name', inputType: 'text' }],
    createNew: async (values: Record<string, string>) => {
      const name = (values.name ?? '').trim()

      await createCarrier.mutateAsync({
        id: '',
        logo: '',
        created_at: null,
        updated_at: null,
        organization: { name, email: '', phone: '', enabled: true },
      } as Carrier)
    },
    canSubmit: (values: Record<string, string>) => (values.name ?? '').trim().length > 0,
  }

  const handleRowClick = (row: Carrier) => {
    setActiveCarrier(row.id)
    openDrawer('carriers')
  }

  return (
    <>
      <DataTable<Carrier>
        label="Carriers"
        data={carriers}
        columns={columns}
        getRowId={(row) => row.id}
        searchable
        searchPlaceholder="Search carriers..."
        onRowClick={handleRowClick}
        pageSize={12}
        actions={
          <>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              aria-label="Create Carrier"
              title="Create Carrier"
            >
              <RowsPlusTopIcon size={28} />
            </Button>
            <AddNewDialog open={createOpen} onOpenChange={setCreateOpen} createConfig={createConfig} />
          </>
        }
      />

      {activeCarrier && <CarriersDrawer carrier_id={activeCarrier} carriers={carriers} />}
    </>
  )
}
