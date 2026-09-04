'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { SalesOrder, statusConfig } from '@/features/orders/salesOrders/types'
import { useDrawerStore } from '@/shared/store/drawerStore'

import { DataTable } from '@/shared/ui/table/Table'
import { TextColumn, DateColumn, IconColumn, OrderNumberColumn } from '@/shared/ui/table/Columns'
import { cn } from '@/shared/utils/cn'
import { useFormatSalesOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { useOrders } from '@dorado/client'
import AdminSalesOrderDrawer from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawer'
import { useAdminUsers } from '@/features/users/queries'

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

  const filterCards = React.useMemo(() => {
    const counts = salesOrders.reduce<Record<string, number>>((acc, so) => {
      acc[so.status ?? ''] = (acc[so.status ?? ''] || 0) + 1
      return acc
    }, {})

    return Object.entries(statusConfig).map(([status, config]) => {
      const Icon = config.icon
      const count = counts[status] ?? 0

      return {
        key: status,
        Icon,
        filter: status,
        header: `${count}`,
        label: status,
        predicate: (so: SalesOrder) => so.status === status,

        buttonActiveClassName: cn('bg-primary/20', 'border-primary', 'text-foreground'),
        iconBaseClassName: 'text-primary',
        iconActiveClassName: 'text-primary',
      }
    })
  }, [salesOrders])

  const columns: ColumnDef<SalesOrder>[] = React.useMemo(
    () => [
      OrderNumberColumn<SalesOrder>({
        id: 'number',
        accessorKey: 'number',
        align: 'center',
        useFormatterHook: useFormatSalesOrderNumber,
        enableHiding: false,
      }),

      TextColumn<SalesOrder>({
        id: 'user_name',
        header: 'User',
        accessorKey: 'user_id',
        formatValue: (value) => usersById.get(String(value)) ?? '',
        align: 'center',
        enableHiding: false,
        size: 160,
      }),

      IconColumn<SalesOrder>({
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        align: 'center',
        renderIcon: ({ value, row }) => {
          const status = (value as string) ?? (row as SalesOrder).status ?? ''
          const config = statusConfig[status]
          if (!config) return null
          const Icon = config.icon
          return <Icon size={20} className={'text-primary'} />
        },
        size: 80,
      }),

      DateColumn<SalesOrder>({
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

  const handleRowClick = (row: Row<SalesOrder>) => {
    setActiveOrder(row.original.id)
    openDrawer('salesOrder')
  }

  return (
    <>
      <DataTable<SalesOrder>
        data={salesOrders}
        columns={columns}
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
        <AdminSalesOrderDrawer order_id={activeOrder ?? ''} />
      )}
    </>
  )
}
