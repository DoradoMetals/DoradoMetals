'use client'

import { MouseEvent } from 'react'
import { Button } from '@dorado/components'
import { Download } from '@dorado/icons'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { PurchaseOrder, statusConfig } from '@/shared/types/purchaseOrders'
import { usePurchaseOrderDownloads } from '@/shared/hooks/usePurchaseOrderDownloads'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useOrderPricing } from '@/shared/hooks/quotes/queries'
import { useFormatPurchaseOrderNumber } from '@/shared/utils/formatOrderNumbers'
import { OrderCardShell } from '../ui/OrderCardShell'
import { useOrderItems } from '@dorado/client'

export default function PurchaseOrderCard({
  order,
  setActivePurchaseOrder,
}: {
  order: PurchaseOrder
  setActivePurchaseOrder: (activePurchaseOrder: string) => void
}) {
  const { openDrawer } = useDrawerStore()
  const downloadButtons = usePurchaseOrderDownloads(order)

  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: items = [] } = useOrderItems(order.id)

  const status = statusConfig[order.status ?? '']
  const Icon = status?.icon

  const { data: quote } = useOrderPricing(order.id)

  const handleOpen = () => {
    setActivePurchaseOrder(order.id)
    openDrawer('purchaseOrder')
  }

  const mkClick = (fn: () => void, pending: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (pending) return
    fn()
  }

  const itemsLabel =
    items.length === 0 ? 'No Items Included' : `${items.length} ${items.length === 1 ? 'Item' : 'Items'}`

  return (
    <OrderCardShell
      createdAtLabel={formatFullDate(order.created_at ?? undefined)}
      orderNumberLabel={formatPurchaseOrderNumber(order.number)}
      statusLabel={order.status ?? ''}
      StatusIcon={Icon}
      total={quote?.total ?? 0}
      secondaryInfo={itemsLabel}
      rightContent={null}
      downloadArea={
        <>
          {downloadButtons.map(({ statuses, label, onClick, isPending }, index) =>
            statuses.includes(order.status ?? '') ? (
              <Button
                key={index}
                variant="tertiary"
                className="flex items-center justify-start gap-2 px-0"
                onClick={mkClick(onClick, isPending)}
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
