'use client'

import { MouseEvent } from 'react'
import { Button } from '@/shared/ui/base/button'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { formatFullDate } from '@/shared/utils/formatDates'
import { SalesOrder, statusConfig } from '@/features/orders/salesOrders/types'
import { AvatarCircles } from '@/features/orders/ui/ImageCirclesOverlapped'
import { DownloadIcon } from '@phosphor-icons/react'
import { useDownloadSalesOrderInvoice } from '@/features/pdfs/queries'
import { useFormatSalesOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { OrderCardShell } from '@/features/orders/ui/OrderCardShell'
import { useOrderItems } from '@/features/orders/reads'
import { useProducts } from '@/features/products/queries'

export default function SalesOrderCard({
  order,
  setActiveOrder,
}: {
  order: SalesOrder
  setActiveOrder: (activeOrder: string) => void
}) {
  const { openDrawer } = useDrawerStore()
  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()

  // A CONTAINER for its own lines (ruling 14). The row carries bullion_id and
  // nothing else about the product; the image comes from the catalogue the
  // storefront already caches, mapped by id client-side.
  const { data: items = [] } = useOrderItems(order.id)
  const { data: catalogue = [] } = useProducts()
  const downloadInvoice = useDownloadSalesOrderInvoice()

  const status = statusConfig[order.status ?? '']
  const Icon = status?.icon

  const avatarItems = items.map((item) => ({
    url: catalogue.find((p) => p.id === item.bullion_id)?.image_front || '',
    count: item.quantity || 1,
  }))

  const itemsLabel =
    items.length === 0 ? 'No Items Included' : `${items.length} ${items.length === 1 ? 'Item' : 'Items'}`

  const downloadOptions = [
    {
      statuses: ['Pending'],
      label: 'Invoice Preview',
      onClick: () =>
        downloadInvoice.mutate({
          order_id: order.id,
          order_number: order.number,
          fileName: 'invoice_preview',
        }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Preparing', 'In Transit', 'Completed'],
      label: 'Invoice',
      onClick: () =>
        downloadInvoice.mutate({
          order_id: order.id,
          order_number: order.number,
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
      createdAtLabel={formatFullDate(order.created_at ?? undefined)}
      orderNumberLabel={formatSalesOrderNumber(order.number)}
      statusLabel={order.status ?? ''}
      StatusIcon={Icon}
      total={order.totals?.total ?? 0}
      secondaryInfo={itemsLabel}
      rightContent={
        <AvatarCircles items={avatarItems} maxDisplay={3} className="bg-transparent border-none" />
      }
      downloadArea={
        <>
          {downloadOptions.map(({ statuses, label, onClick, isPending }, index) =>
            statuses.includes(order.status ?? '') ? (
              <Button
                key={index}
                variant="link"
                className="flex items-center justify-start gap-2 px-0"
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
