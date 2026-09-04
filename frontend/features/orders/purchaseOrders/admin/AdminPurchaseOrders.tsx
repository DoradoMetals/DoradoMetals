'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { PurchaseOrder, statusConfig } from '@/features/orders/purchaseOrders/types'
import { useAdminPurchaseOrders } from '@/features/orders/purchaseOrders/admin/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import AdminPurchaseOrderDrawer from './adminPurchaseOrderDrawer/adminPurchaseOrderDrawer'
import { DataTable } from '@/shared/ui/table/Table'
import { TextColumn, DateColumn, IconColumn, OrderNumberColumn } from '@/shared/ui/table/Columns'
import { cn } from '@/shared/utils/cn'
import { useFormatPurchaseOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { useAdminUsers } from '@/features/users/queries'

const STATUS_FILTERS = ['In Transit', 'Received', 'Payment Processing', 'Completed'] as const

export default function PurchaseOrdersPage() {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()
  const { openDrawer } = useDrawerStore()

  const [activeOrder, setActiveOrder] = React.useState<string | null>(null)
  const [activeUser, setActiveUser] = React.useState<string | null>(null)

  // The list wire carries user_id and nothing joined on (orders/sql/list.sql);
  // names come from the admin users list, matched by id.
  const { data: adminUsers } = useAdminUsers()
  const usersById = React.useMemo(
    () => new Map((adminUsers ?? []).map((u) => [u.id, u.name])),
    [adminUsers]
  )

  const filterCards = React.useMemo(() => {
    const counts = purchaseOrders.reduce<Record<string, number>>((acc, po) => {
      acc[po.status ?? ''] = (acc[po.status ?? ''] || 0) + 1
      return acc
    }, {})

    return STATUS_FILTERS.map((status) => {
      const config = statusConfig[status]
      const Icon = config.icon
      const count = counts[status] ?? 0

      return {
        key: status,
        Icon,
        filter: status,
        header: `${count}`,
        label: status,
        predicate: (po: PurchaseOrder) => po.status === status,
        buttonActiveClassName: cn('bg-primary/20', 'border-primary', 'text-foreground'),
        iconBaseClassName: 'text-primary',
        iconActiveClassName: 'text-primary',
      }
    })
  }, [purchaseOrders])

  const columns: ColumnDef<PurchaseOrder>[] = React.useMemo(
    () => [
      OrderNumberColumn<PurchaseOrder>({
        id: 'number',
        accessorKey: 'number',
        align: 'center',
        useFormatterHook: useFormatPurchaseOrderNumber,
        enableHiding: false,
      }),

      TextColumn<PurchaseOrder>({
        id: 'user_name',
        header: 'User',
        accessorKey: 'user_id',
        formatValue: (value) => usersById.get(String(value)) ?? '',
        align: 'center',
        enableHiding: false,
        textClassName: 'text-micro sm:text-small text-foreground',
        size: 160,
      }),

      IconColumn<PurchaseOrder>({
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        align: 'center',
        renderIcon: ({ value, row }) => {
          const status = (value as string) ?? (row as PurchaseOrder).status ?? ''
          const config = statusConfig[status]
          if (!config) return null
          const Icon = config.icon
          return <Icon size={20} className={'text-primary'} />
        },
        size: 80,
      }),

      DateColumn<PurchaseOrder>({
        id: 'created_at',
        header: 'Created On',
        accessorKey: 'created_at',
        align: 'center',
        hideOnSmall: true,
        size: 200,
      }),

    ],
    [usersById]
  )

  const handleRowClick = (row: Row<PurchaseOrder>) => {
    setActiveOrder(row.original.id)
    setActiveUser(row.original.user_id)
    openDrawer('purchaseOrder')
  }

  return (
    <>
      <DataTable<PurchaseOrder>
        data={purchaseOrders}
        columns={columns}
        hidePagination
        searchColumnId="number"
        searchPlaceholder="Search orders..."
        enableColumnVisibility={true}
        onRowClick={handleRowClick}
        getRowClassName={(row) => {
          const cfg = statusConfig[row.original.status ?? '']
          return cn('hover:bg-background hover:cursor-pointer', 'hover:bg-primary/20')
        }}
        filterCards={filterCards}
      />

      {activeOrder && (
        <AdminPurchaseOrderDrawer order_id={activeOrder} user_id={activeUser ?? ''} />
      )}
    </>
  )
}
