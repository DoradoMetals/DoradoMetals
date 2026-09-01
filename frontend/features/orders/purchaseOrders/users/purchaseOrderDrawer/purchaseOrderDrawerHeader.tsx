import {
  useDownloadInvoice,
  useDownloadPackingList,
  useDownloadReturnPackingList,
} from '@/features/pdfs/queries'
import { packageOptions } from '@/features/packaging/types'
import { PurchaseOrderDrawerHeaderProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useFormatPurchaseOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { useSpotPrices } from '@/features/spots/queries'
import { useOrderSpots, nameSpots } from '@/features/orders/spots'
import { OrderDrawerHeader } from '@/features/orders/ui/OrderDrawerHeader'

export default function PurchaseOrderDrawerHeader({ order }: PurchaseOrderDrawerHeaderProps) {
  const downloadPackingList = useDownloadPackingList()
  const downloadReturnPackingList = useDownloadReturnPackingList()
  const downloadInvoice = useDownloadInvoice()

  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  // Display composition, client-side: the rows carry metal_id, the reference
  // read supplies the names the PDF templates print.
  const namedOrderSpots = nameSpots(orderSpots, spotPrices)

  const status = statusConfig[order.status ?? '']
  const Icon = status?.icon
  // The package and the payout method are the SERVER's to resolve now: the
  // download body is { order_id }, and the packing list prints the box the
  // parcel was actually booked with rather than the first entry of a
  // hard-coded list when the label failed to match (ruling 10).

  const downloadOptions = [
    {
      statuses: ['In Transit'],
      label: 'Shipping Info',
      onClick: () => {
        downloadPackingList.mutate({ order_id: order.id, order_number: order.number })
      },
      isPending: downloadPackingList.isPending,
    },
    {
      statuses: ['Cancelled'],
      label: 'Shipping Info',
      onClick: () => {
        downloadReturnPackingList.mutate({ order_id: order.id, order_number: order.number })
      },
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

  return (
    <OrderDrawerHeader
      primary={formatFullDate(order.created_at ?? undefined)}
      secondary={formatPurchaseOrderNumber(order.number)}
      status={order.status}
      icon={status ? Icon : undefined}
      downloads={downloadOptions}
    />
  )
}
