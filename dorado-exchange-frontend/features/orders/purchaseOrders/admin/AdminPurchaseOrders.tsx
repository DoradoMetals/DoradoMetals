'use client'

import * as React from 'react'
import type { ColumnDef, Row } from '@tanstack/react-table'

import { PurchaseOrder, statusConfig } from '@/features/orders/purchaseOrders/types'
import {
  useAdminPurchaseOrders,
  usePurgeCancelled,
} from '@/features/orders/purchaseOrders/admin/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import AdminPurchaseOrderDrawer from './adminPurchaseOrderDrawer/adminPurchaseOrderDrawer'
import { DataTable } from '@/shared/ui/table/Table'
import { TextColumn, DateColumn, IconColumn, OrderNumberColumn } from '@/shared/ui/table/Columns'
import { cn } from '@/shared/utils/cn'
import { Button } from '@/shared/ui/base/button'
import { FileXIcon } from '@phosphor-icons/react'
import { useFormatPurchaseOrderNumber } from '@/features/orders/utils/formatOrderNumbers'

const STATUS_FILTERS = ['In Transit', 'Received', 'Payment Processing', 'Completed'] as const

export default function PurchaseOrdersPage() {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()
  const { openDrawer } = useDrawerStore()
  const purgeCancelled = usePurgeCancelled()

  const [activeOrder, setActiveOrder] = React.useState<string | null>(null)
  const [activeUser, setActiveUser] = React.useState<string | null>(null)

  const filterCards = React.useMemo(() => {
    const counts = purchaseOrders.reduce<Record<string, number>>((acc, po) => {
      acc[po.purchase_order_status] = (acc[po.purchase_order_status] || 0) + 1
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
        predicate: (po: PurchaseOrder) => po.purchase_order_status === status,
        buttonActiveClassName: cn(config.muted_bg, config.border_color, 'text-neutral-900'),
        iconBaseClassName: config.text_color,
        iconActiveClassName: config.text_color,
      }
    })
  }, [purchaseOrders])

  const columns: ColumnDef<PurchaseOrder>[] = React.useMemo(
    () => [
      OrderNumberColumn<PurchaseOrder>({
        id: 'order_number',
        accessorKey: 'order_number',
        align: 'center',
        useFormatterHook: useFormatPurchaseOrderNumber,
        enableHiding: false,
      }),

      TextColumn<PurchaseOrder>({
        id: 'user_name',
        header: 'User',
        accessorKey: 'user.user_name',
        align: 'center',
        enableHiding: false,
        textClassName: 'text-xs sm:text-sm text-neutral-900',
        size: 160,
      }),

      IconColumn<PurchaseOrder>({
        id: 'purchase_order_status',
        header: 'Status',
        accessorKey: 'purchase_order_status',
        align: 'center',
        renderIcon: ({ value, row }) => {
          const status = (value as string) ?? (row as PurchaseOrder).purchase_order_status
          const config = statusConfig[status]
          if (!config) return null
          const Icon = config.icon
          return <Icon size={20} className={config.text_color} />
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

      TextColumn<PurchaseOrder>({
        id: 'shipment_status',
        header: 'Shipment Status',
        accessorKey: 'shipment.shipping_status',
        align: 'center',
        enableHiding: true,
        textClassName: 'text-xs sm:text-sm text-neutral-800',
        size: 200,
      }),
    ],
    []
  )

  const handleRowClick = (row: Row<PurchaseOrder>) => {
    setActiveOrder(row.original.id)
    setActiveUser(row.original.user_id)
    openDrawer('purchaseOrder')
  }

  const purgeButton = (
    <Button
      variant="ghost"
      className="p-0 gap-1 text-destructive/80 text-sm hover:text-destructive"
      onClick={() => purgeCancelled.mutate()}
      disabled={purgeCancelled.isPending}
    >
      <FileXIcon size={16} />
      {purgeCancelled.isPending ? 'Purging...' : 'Purge Cancelled'}
    </Button>
  )

  return (
    <>
      <DataTable<PurchaseOrder>
        data={purchaseOrders}
        columns={columns}
        hidePagination
        searchColumnId="order_number"
        searchPlaceholder="Search orders..."
        enableColumnVisibility={true}
        onRowClick={handleRowClick}
        getRowClassName={(row) => {
          const cfg = statusConfig[row.original.purchase_order_status]
          return cn('hover:bg-background hover:cursor-pointer', cfg?.muted_color)
        }}
        filterCards={filterCards}
        footerRightContent={purgeButton}
      />

      {activeOrder && (
        <AdminPurchaseOrderDrawer order_id={activeOrder} user_id={activeUser ?? ''} />
      )}
    </>
  )
}
