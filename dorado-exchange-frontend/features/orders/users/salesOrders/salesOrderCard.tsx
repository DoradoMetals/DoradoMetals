'use client'

import { MouseEvent } from 'react'
import { Button } from '@/shared/ui/base/button'
import { useDrawerStore } from '@/store/drawerStore'
import { formatFullDate } from '@/shared/utils/formatDates'
import { SalesOrder, statusConfig } from '@/types/sales-orders'
import { AvatarCircles } from '@/features/orders/ui/ImageCirclesOverlapped'
import { DownloadIcon } from '@phosphor-icons/react'
import { useDownloadSalesOrderInvoice } from '@/features/pdfs/queries'
import { useSalesOrderMetals } from '@/features/orders/users/salesOrders/queries'
import { useFormatSalesOrderNumber } from '@/utils/formatting/order-numbers'
import { OrderCardShell } from '@/features/orders/users/orderCardShell'

export default function SalesOrderCard({
  order,
  setActiveOrder,
}: {
  order: SalesOrder
  setActiveOrder: (activeOrder: string) => void
}) {
  const { openDrawer } = useDrawerStore()
  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()

  const { data: orderSpots = [] } = useSalesOrderMetals(order.id)
  const downloadInvoice = useDownloadSalesOrderInvoice()

  const status = statusConfig[order.sales_order_status]
  const Icon = status?.icon

  const avatarItems = order.order_items.map((item) => ({
    url: item.product?.image_front || '',
    count: item.quantity || 1,
  }))

  const itemsLabel =
    order.order_items.length === 0
      ? 'No Items Included'
      : `${order.order_items.length} ${order.order_items.length === 1 ? 'Item' : 'Items'}`

  const downloadOptions = [
    {
      statuses: ['Pending'],
      label: 'Invoice Preview',
      onClick: () =>
        downloadInvoice.mutate({
          salesOrder: order,
          orderSpots,
          fileName: 'invoice_preview',
        }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Preparing', 'In Transit', 'Completed'],
      label: 'Invoice',
      onClick: () =>
        downloadInvoice.mutate({
          salesOrder: order,
          orderSpots,
          fileName: 'invoice',
        }),
      isPending: downloadInvoice.isPending,
    },
  ]

  const handleOpen = () => {
    setActiveOrder(order.id)
    openDrawer('salesOrder')
  }

  const stopAnd = (fn: () => void, isPending: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (isPending) return
    fn()
  }

  return (
    <OrderCardShell
      createdAtLabel={formatFullDate(order.created_at)}
      orderNumberLabel={formatSalesOrderNumber(order.order_number)}
      statusLabel={order.sales_order_status}
      StatusIcon={Icon}
      total={order.order_total}
      secondaryInfo={itemsLabel}
      rightContent={
        <AvatarCircles items={avatarItems} maxDisplay={3} className="bg-transparent border-none" />
      }
      downloadArea={
        <>
          {downloadOptions.map(({ statuses, label, onClick, isPending }, index) =>
            statuses.includes(order.sales_order_status) ? (
              <Button
                key={index}
                variant="link"
                className="flex items-center justify-start gap-2 text-sm bg-transparent px-0"
                onClick={stopAnd(onClick, isPending)}
                disabled={isPending}
              >
                <DownloadIcon size={20} className="text-primary" />
                <span>{isPending ? 'Loading...' : label}</span>
              </Button>
            ) : null
          )}
        </>
      }
      onOpen={handleOpen}
    />
  )
}
