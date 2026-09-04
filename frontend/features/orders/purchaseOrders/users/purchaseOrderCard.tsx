'use client'

import { MouseEvent } from 'react'
import { Button } from '@dorado/components'
import { Download } from '@dorado/icons'
import {
  useDownloadInvoice,
  useDownloadPackingList,
  useDownloadReturnPackingList,
} from '@/features/pdfs/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { PurchaseOrder, statusConfig } from '@/features/orders/purchaseOrders/types'
import { formatFullDate } from '@/shared/utils/formatDates'
// The card's total is the server's order quote (Jacob's no-previews ruling).
import { useOrderQuote } from '@/features/quotes/queries'
import { useFormatPurchaseOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { OrderCardShell } from '@/features/orders/ui/OrderCardShell'
import { useOrderItems } from '@dorado/client'

export default function PurchaseOrderCard({
  order,
  setActivePurchaseOrder,
}: {
  order: PurchaseOrder
  setActivePurchaseOrder: (activePurchaseOrder: string) => void
}) {
  const { openDrawer } = useDrawerStore()
  const downloadPackingList = useDownloadPackingList()
  const downloadReturnPackingList = useDownloadReturnPackingList()
  const downloadInvoice = useDownloadInvoice()

  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  // The card is a CONTAINER for its own lines (ruling 14): one hook next to
  // what it renders, rather than a composed order drilled in from the tab.
  const { data: items = [] } = useOrderItems(order.id)

  const status = statusConfig[order.status ?? '']
  const Icon = status?.icon

  const { data: quote } = useOrderQuote(order.id)

  const handleOpen = () => {
    setActivePurchaseOrder(order.id)
    openDrawer('purchaseOrder')
  }

  const mkClick = (fn: () => void, pending: boolean) => (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (pending) return
    fn()
  }

  const downloadButtons = [
    {
      statuses: ['In Transit'],
      label: 'Shipment Info',
      onClick: () =>
        downloadPackingList.mutate({ order_id: order.id, order_number: order.number }),
      isPending: downloadPackingList.isPending,
    },
    {
      statuses: ['Cancelled'],
      label: 'Shipment Info',
      onClick: () =>
        downloadReturnPackingList.mutate({ order_id: order.id, order_number: order.number }),
      isPending: downloadReturnPackingList.isPending,
    },
    {
      statuses: ['Received'],
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
      statuses: ['Payment Processing', 'Completed'],
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
