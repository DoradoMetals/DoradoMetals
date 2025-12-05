'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { AdminProduct } from '@/types/admin'
import { useDrawerStore } from '@/store/drawerStore'
import ProductDrawer from './productDrawer'
import { TextColumn, ChipColumn } from '@/components/table/columns'
import { DataTable } from '@/components/table/table'
import { GoldIcon, SilverIcon, PlatinumIcon, PalladiumIcon } from '@/components/icons/logo'
import { CreateConfig } from '@/components/table/addNew'
import { useAdminProducts, useCreateProduct } from '@/lib/queries/admin/useAdmin'

const formatPremium = (mult?: number | null) => {
  if (mult == null) return '-'
  const pct = Math.abs(mult - 1) * 100
  const dir = mult >= 1 ? 'over' : 'under'
  return `${pct.toFixed(2)}% ${dir}`
}

type Metal = 'Gold' | 'Silver' | 'Platinum' | 'Palladium'

export default function ProductsPage() {
  const { data: products = [] } = useAdminProducts()
  const createProduct = useCreateProduct()
  const { openDrawer } = useDrawerStore()
  const [activeProduct, setActiveProduct] = React.useState<string | null>(null)

  const metalCounts = React.useMemo(() => {
    const base: Record<Metal, number> = {
      Gold: 0,
      Silver: 0,
      Platinum: 0,
      Palladium: 0,
    }

    for (const p of products) {
      const metal = p.metal as Metal | null
      if (metal && metal in base) base[metal]++
    }

    return base
  }, [products])

  const metalFilterCards = React.useMemo(
    () => [
      {
        key: 'Gold',
        Icon: GoldIcon,
        filter: 'gold',
        header: 'Gold',
        label: `${metalCounts.Gold} products`,
        predicate: (p: AdminProduct) => p.metal === 'Gold',
      },
      {
        key: 'Silver',
        Icon: SilverIcon,
        filter: 'silver',
        header: 'Silver',
        label: `${metalCounts.Silver} products`,
        predicate: (p: AdminProduct) => p.metal === 'Silver',
      },
      {
        key: 'Platinum',
        Icon: PlatinumIcon,
        filter: 'platinum',
        header: 'Platinum',
        label: `${metalCounts.Platinum} products`,
        predicate: (p: AdminProduct) => p.metal === 'Platinum',
      },
      {
        key: 'Palladium',
        Icon: PalladiumIcon,
        filter: 'palladium',
        header: 'Palladium',
        label: `${metalCounts.Palladium} products`,
        predicate: (p: AdminProduct) => p.metal === 'Palladium',
      },
    ],
    [metalCounts]
  )

  const columns: ColumnDef<AdminProduct>[] = [
    TextColumn<AdminProduct>({
      id: 'product_name',
      header: 'Name',
      accessorKey: 'product_name',
      align: 'left',
      enableHiding: false,
      size: 240,
    }),
    TextColumn<AdminProduct>({
      id: 'metal',
      header: 'Metal',
      accessorKey: 'metal',
      align: 'left',
      enableHiding: true,
      headerClassName: 'hidden sm:flex',
      cellClassName: 'hidden sm:flex',
      textClassName: 'text-xs sm:text-sm text-neutral-900',
      size: 100,
    }),
    ChipColumn<AdminProduct>({
      id: 'display',
      header: 'Active',
      accessorKey: 'display',
      align: 'center',
      enableHiding: true,
      size: 110,
      getChip: ({ row }) => {
        const product = row as AdminProduct
        const active = !!(product.display || product.sell_display)
        return {
          label: active ? 'Active' : 'Inactive',
          className: active
            ? 'bg-success/20 text-success border-success'
            : 'bg-destructive/20 text-destructive border-destructive',
        }
      },
    }),
    TextColumn<AdminProduct>({
      id: 'bid_premium',
      header: 'Bid',
      accessorKey: 'bid_premium',
      align: 'center',
      enableHiding: true,
      formatValue: (raw) => formatPremium(raw as number | null | undefined),
      textClassName: 'text-xs sm:text-sm text-neutral-900',
      size: 120,
    }),
    TextColumn<AdminProduct>({
      id: 'ask_premium',
      header: 'Ask',
      accessorKey: 'ask_premium',
      align: 'center',
      enableHiding: true,
      formatValue: (raw) => formatPremium(raw as number | null | undefined),
      textClassName: 'text-xs sm:text-sm text-neutral-900',
      size: 120,
    }),
  ]

  const createConfig: CreateConfig = {
    title: 'Create New Product',
    submitLabel: 'Create Product',
    fields: [
      {
        name: 'product_name',
        label: 'Product Name',
        inputType: 'text',
      },
    ],
    createNew: async (values: Record<string, string>) => {
      const name = (values.product_name ?? '').trim()
      await createProduct.mutateAsync({ name })
    },
    canSubmit: (values: Record<string, string>) => (values.product_name ?? '').trim().length > 0,
  }
  const handleRowClick = (row: Row<AdminProduct>) => {
    setActiveProduct(row.original.id)
    openDrawer('product')
  }

  return (
    <>
      <DataTable<AdminProduct>
        data={products}
        columns={columns}
        initialPageSize={12}
        searchColumnId="product_name"
        searchPlaceholder="Search products..."
        enableColumnVisibility
        onRowClick={handleRowClick}
        getRowClassName={() => 'hover:bg-background hover:cursor-pointer'}
        filterCards={metalFilterCards}
        createConfig={createConfig}
      />

      {activeProduct && <ProductDrawer product_id={activeProduct} products={products} />}
    </>
  )
}
