'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { SalesOrder, statusConfig } from '@/types/sales-orders'
import { useAdminSalesOrders } from '@/lib/queries/admin/useAdminSalesOrders'
import { useDrawerStore } from '@/store/drawerStore'
import AdminSalesOrderDrawer from './adminSalesOrderDrawer/adminSalesOrderDrawer'

import { DataTable } from '@/shared/ui/table/Table'
import { TextColumn, DateColumn, IconColumn, OrderNumberColumn } from '@/shared/ui/table/Columns'
import { cn } from '@/lib/utils'
import { useFormatSalesOrderNumber } from '@/utils/formatting/order-numbers'

export default function SalesOrdersPage() {
  const { data: salesOrders = [] } = useAdminSalesOrders()
  const { openDrawer } = useDrawerStore()

  const [activeOrder, setActiveOrder] = React.useState<string | null>(null)
  const [activeUser, setActiveUser] = React.useState<string | null>(null)

  const filterCards = React.useMemo(() => {
    const counts = salesOrders.reduce<Record<string, number>>((acc, so) => {
      acc[so.sales_order_status] = (acc[so.sales_order_status] || 0) + 1
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
        predicate: (so: SalesOrder) => so.sales_order_status === status,

        buttonActiveClassName: cn(config.muted_bg, config.border_color, 'text-neutral-900'),
        iconBaseClassName: config.text_color,
        iconActiveClassName: config.text_color,
      }
    })
  }, [salesOrders])

  const columns: ColumnDef<SalesOrder>[] = React.useMemo(
    () => [
      OrderNumberColumn<SalesOrder>({
        id: 'order_number',
        accessorKey: 'order_number',
        align: 'center',
        useFormatterHook: useFormatSalesOrderNumber,
        enableHiding: false,
      }),

      TextColumn<SalesOrder>({
        id: 'user_name',
        header: 'User',
        accessorKey: 'user.user_name',
        align: 'center',
        enableHiding: false,
        textClassName: 'text-xs sm:text-sm text-neutral-900',
        size: 160,
      }),

      IconColumn<SalesOrder>({
        id: 'sales_order_status',
        header: 'Status',
        accessorKey: 'sales_order_status',
        align: 'center',
        renderIcon: ({ value, row }) => {
          const status = (value as string) ?? (row as SalesOrder).sales_order_status
          const config = statusConfig[status]
          if (!config) return null
          const Icon = config.icon
          return <Icon size={20} className={config.text_color} />
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
    []
  )

  const handleRowClick = (row: Row<SalesOrder>) => {
    setActiveOrder(row.original.id)
    setActiveUser(row.original.user_id)
    openDrawer('salesOrder')
  }

  return (
    <>
      <DataTable<SalesOrder>
        data={salesOrders}
        columns={columns}
        initialPageSize={12}
        searchColumnId="order_number"
        searchPlaceholder="Search orders..."
        enableColumnVisibility={true}
        onRowClick={handleRowClick}
        getRowClassName={(row) => {
          const cfg = statusConfig[row.original.sales_order_status]
          return cn('hover:bg-background hover:cursor-pointer', cfg?.muted_color)
        }}
        filterCards={filterCards}
      />

      {activeOrder && (
        <AdminSalesOrderDrawer order_id={activeOrder ?? ''} user_id={activeUser ?? ''} />
      )}
    </>
  )
}
