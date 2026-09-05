'use client'

import * as React from 'react'

import { DataTable, type DataTableColumn } from '@dorado/components'

import { SalesOrder, statusConfig } from '@/shared/types/salesOrders'
import { useDrawerStore } from '@/shared/store/drawerStore'

import { useOrders } from '@dorado/client'
import AdminSalesOrderDrawer from './adminSalesOrderDrawer/adminSalesOrderDrawer'
import { useAdminUsers } from '@dorado/client'

export default function SalesOrdersPage() {
  const { data: salesOrders = [] } = useOrders({ direction: 'sale' }, { refetchInterval: 10_000 })
  const { openDrawer } = useDrawerStore()

  const [activeOrder, setActiveOrder] = React.useState<string | null>(null)

  // The list wire carries user_id and nothing joined on (orders/sql/list.sql);
  // names come from the admin users list, matched by id.
  const { data: adminUsers } = useAdminUsers()
  const usersById = React.useMemo(
    () => new Map((adminUsers ?? []).map((u) => [u.id, u.name])),
    [adminUsers]
  )

  const columns: DataTableColumn<SalesOrder>[] = React.useMemo(
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

  const handleRowClick = (order: SalesOrder) => {
    setActiveOrder(order.id)
    openDrawer('salesOrder')
  }

  return (
    <>
      <DataTable<SalesOrder>
        label="Sales orders"
        data={salesOrders}
        columns={columns}
        getRowId={(row) => row.id}
        searchable
        searchPlaceholder="Search orders..."
        onRowClick={handleRowClick}
      />

      {activeOrder && (
        <AdminSalesOrderDrawer order_id={activeOrder ?? ''} />
      )}
    </>
  )
}
