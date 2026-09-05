'use client'

import { MouseEvent } from 'react'
import { Button } from '@dorado/components'
import { Download } from '@dorado/icons'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { formatFullDate } from '@/shared/utils/formatDates'
import { SalesOrder, statusConfig } from '@/shared/types/salesOrders'
import { AvatarCircles } from '../ui/ImageCirclesOverlapped'
import { useSalesOrderDownloads } from '@/shared/hooks/useSalesOrderDownloads'
import { useFormatSalesOrderNumber } from '@/shared/utils/formatOrderNumbers'
import { OrderCardShell } from '../ui/OrderCardShell'
import { useProducts } from '@/shared/hooks/products/queries'
import { useOrderItems } from '@dorado/client'

export default function SalesOrderCard({
  order,
  setActiveOrder,
}: {
  order: SalesOrder
  setActiveOrder: (activeOrder: string) => void
}) {
  const { openDrawer } = useDrawerStore()
  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()

  const { data: items = [] } = useOrderItems(order.id)
  const { data: catalogue = [] } = useProducts()
  const downloadOptions = useSalesOrderDownloads(order)

  const status = statusConfig[order.status ?? '']
  const Icon = status?.icon

  const avatarItems = items.map((item) => ({
    url: catalogue.find((p) => p.id === item.bullion_id)?.image_front || '',
    count: item.quantity || 1,
  }))

  const itemsLabel =
    items.length === 0 ? 'No Items Included' : `${items.length} ${items.length === 1 ? 'Item' : 'Items'}`

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
                variant="tertiary"
                className="flex items-center justify-start gap-2 px-0"
                onClick={stopAnd(onClick, isPending)}
                disabled={isPending}
              >
                <Download size={20} className="text-primary" />
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
