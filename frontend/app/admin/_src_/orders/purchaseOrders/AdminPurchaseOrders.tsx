'use client'

import * as React from 'react'

import { DataTable, type DataTableColumn } from '@dorado/components'

import { PurchaseOrder, statusConfig } from '@/shared/types/purchaseOrders'
import { useOrders } from '@dorado/client'
import { useDrawerStore } from '@/shared/store/drawerStore'
import AdminPurchaseOrderDrawer from './adminPurchaseOrderDrawer/adminPurchaseOrderDrawer'
import { useAdminUsers } from '@dorado/client'

export default function PurchaseOrdersPage() {
  const { data: purchaseOrders = [] } = useOrders(
    { direction: 'purchase' },
    { refetchInterval: 10_000 }
  )
  const { openDrawer } = useDrawerStore()

  const [activeOrder, setActiveOrder] = React.useState<string | null>(null)

  // The list wire carries user_id and nothing joined on (orders/sql/list.sql);
  // names come from the admin users list, matched by id.
  const { data: adminUsers } = useAdminUsers()
  const usersById = React.useMemo(
    () => new Map((adminUsers ?? []).map((u) => [u.id, u.name])),
    [adminUsers]
  )

  const columns: DataTableColumn<PurchaseOrder>[] = React.useMemo(
    () => [
      {
        accessorKey: 'number',
        header: 'Order #',
      },

      {
        id: 'user_name',
        header: 'User',
        accessorFn: (row) => usersById.get(row.user_id ?? '') ?? '',
      },

      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status ?? ''
          const config = statusConfig[status]
          if (!config) return null
          const Icon = config.icon
          return <Icon size={20} className="text-primary" />
        },
      },

      {
        accessorKey: 'created_at',
        header: 'Created On',
        cell: ({ row }) => {
          const raw = row.original.created_at
          if (!raw) return '-'
          return new Date(raw).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        },
      },
    ],
    [usersById]
  )

  const handleRowClick = (order: PurchaseOrder) => {
    setActiveOrder(order.id)
    openDrawer('purchaseOrder')
  }

  return (
    <>
      <DataTable<PurchaseOrder>
        label="Purchase orders"
        data={purchaseOrders}
        columns={columns}
        getRowId={(row) => row.id}
        searchable
        searchPlaceholder="Search orders..."
        onRowClick={handleRowClick}
      />

      {activeOrder && <AdminPurchaseOrderDrawer order_id={activeOrder} />}
    </>
  )
}
