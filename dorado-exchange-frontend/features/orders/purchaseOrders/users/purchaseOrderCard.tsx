'use client'

import { MouseEvent, useMemo } from 'react'
import { Button } from '@/shared/ui/base/button'
import {
  useDownloadInvoice,
  useDownloadPackingList,
  useDownloadReturnPackingList,
} from '@/features/pdfs/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { packageOptions } from '@/features/packaging/types'
import { payoutOptions } from '@/features/payouts/types'
import { PurchaseOrder, statusConfig } from '@/features/orders/purchaseOrders/types'
import { formatFullDate } from '@/shared/utils/formatDates'
import getPurchaseOrderTotal from '@/features/orders/purchaseOrders/utils/purchaseOrderTotal'
import { DownloadIcon } from '@phosphor-icons/react'
import { useFormatPurchaseOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { useSpotPrices } from '@/features/spots/queries'
import { usePurchaseOrderMetals } from '@/features/orders/purchaseOrders/users/queries'
import { OrderCardShell } from '@/features/orders/ui/OrderCardShell'

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
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpots = [] } = usePurchaseOrderMetals(order.id)

  const status = statusConfig[order.purchase_order_status]
  const Icon = status?.icon

  const packageDetails =
    packageOptions.find((pkg) => pkg.label === order.shipment.package) ?? packageOptions[0]
  const payoutDetails =
    payoutOptions.find((payout) => payout.method === order.payout.method) ?? payoutOptions[0]

  const total = useMemo(
    () => getPurchaseOrderTotal(order, spotPrices, orderSpots),
    [order, spotPrices, orderSpots]
  )

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
        downloadPackingList.mutate({
          purchaseOrder: order,
          spotPrices,
          packageDetails,
          payoutDetails,
        }),
      isPending: downloadPackingList.isPending,
    },
    {
      statuses: ['Cancelled'],
      label: 'Shipment Info',
      onClick: () =>
        downloadReturnPackingList.mutate({
          purchaseOrder: order,
          spotPrices,
        }),
      isPending: downloadReturnPackingList.isPending,
    },
    {
      statuses: ['Received', 'Offer Sent', 'Rejected'],
      label: 'Invoice Preview',
      onClick: () =>
        downloadInvoice.mutate({
          purchaseOrder: order,
          spotPrices,
          orderSpots,
          fileName: 'invoice_preview',
        }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Accepted', 'Payment Processing', 'Completed'],
      label: 'Invoice',
      onClick: () =>
        downloadInvoice.mutate({
          purchaseOrder: order,
          spotPrices,
          orderSpots,
          fileName: 'invoice',
        }),
      isPending: downloadInvoice.isPending,
    },
  ]

  const itemsLabel =
    order.order_items.length === 0
      ? 'No Items Included'
      : `${order.order_items.length} ${order.order_items.length === 1 ? 'Item' : 'Items'}`

  return (
    <OrderCardShell
      createdAtLabel={formatFullDate(order.created_at)}
      orderNumberLabel={formatPurchaseOrderNumber(order.order_number)}
      statusLabel={order.purchase_order_status}
      StatusIcon={Icon}
      total={total}
      secondaryInfo={itemsLabel}
      rightContent={null}
      downloadArea={
        <>
          {downloadButtons.map(({ statuses, label, onClick, isPending }, index) =>
            statuses.includes(order.purchase_order_status) ? (
              <Button
                key={index}
                variant="link"
                className="flex items-center justify-start gap-2 text-sm bg-transparent px-0"
                onClick={mkClick(onClick, isPending)}
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
