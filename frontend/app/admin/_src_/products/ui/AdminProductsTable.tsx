'use client'
import * as React from 'react'
import { Rows3 } from '@dorado/icons'

import { Amount, Badge, Button, DataTable, type DataTableColumn } from '@dorado/components'

import { useDrawerStore } from '@/shared/store/drawerStore'
import ProductDrawer from './ProductDrawer'
import { useAdminProducts, useCreateProduct } from '@/shared/hooks/products/queries'
import { AdminProduct } from '@/shared/types/products'
import { AddNewDialog, CreateConfig } from '../../ui/CreateDialog'

function PremiumCell({ mult }: { mult: number | null | undefined }) {
  if (mult == null) return <span className="flex justify-center">-</span>

  const pct = Math.abs(mult - 1)
  const dir = mult >= 1 ? 'over' : 'under'

  return (
    <span className="flex items-center justify-center gap-1">
      <Amount value={pct} format={{ style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
      {dir}
    </span>
  )
}

export default function ProductsPage() {
  const { data: products = [] } = useAdminProducts()
  const createProduct = useCreateProduct()
  const { openDrawer } = useDrawerStore()
  const [activeProduct, setActiveProduct] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const columns: DataTableColumn<AdminProduct>[] = [
    {
      id: 'image_front',
      header: 'Obverse',
      cell: ({ row }) => {
        const src = (row.original.image_front ?? '').trim()
        if (!src) return <div className="size-12.5 rounded-md border border-border bg-muted" />
        return (
          <img
            src={src}
            alt={row.original.name}
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
      id: 'name',
      header: 'Name',
      accessorKey: 'name',
      meta: { primary: true },
      enableSorting: true,
    },
    {
      id: 'metal',
      header: 'Metal',
      accessorKey: 'metal',
    },
    {
      id: 'display',
      header: () => <span className="flex w-full justify-center">Status</span>,
      cell: ({ row }) => {
        const active = !!row.original.display
        return (
          <span className="flex justify-center">
            <Badge intent={active ? 'success' : 'danger'}>{active ? 'Active' : 'Inactive'}</Badge>
          </span>
        )
      },
    },
    {
      id: 'bid_premium',
      header: () => <span className="flex w-full justify-center">Bid</span>,
      cell: ({ row }) => <PremiumCell mult={row.original.bid_premium} />,
    },
    {
      id: 'ask_premium',
      header: () => <span className="flex w-full justify-center">Ask</span>,
      cell: ({ row }) => <PremiumCell mult={row.original.ask_premium} />,
    },
  ]

  const createConfig: CreateConfig = {
    title: 'Create New Product',
    submitLabel: 'Create Product',
    fields: [
      {
        name: 'name',
        label: 'Product Name',
        inputType: 'text',
      },
    ],
    createNew: async (values: Record<string, string>) => {
      const name = (values.name ?? '').trim()
      await createProduct.mutateAsync({ name })
    },
    canSubmit: (values: Record<string, string>) => (values.name ?? '').trim().length > 0,
  }
  const handleRowClick = (row: AdminProduct) => {
    setActiveProduct(row.id)
    openDrawer('product')
  }

  return (
    <>
      <DataTable<AdminProduct>
        label="Products"
        data={products}
        columns={columns}
        getRowId={(row) => row.id}
        searchable
        searchPlaceholder="Search products..."
        onRowClick={handleRowClick}
        pageSize={10}
        actions={
          <>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              aria-label="Create Product"
              title="Create Product"
            >
              <Rows3 size={28} />
            </Button>
            <AddNewDialog open={createOpen} onOpenChange={setCreateOpen} createConfig={createConfig} />
          </>
        }
      />

      {activeProduct && <ProductDrawer product_id={activeProduct} products={products} />}
    </>
  )
}
