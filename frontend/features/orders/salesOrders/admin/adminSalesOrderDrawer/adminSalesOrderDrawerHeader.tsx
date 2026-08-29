import { useDownloadSalesOrderInvoice } from '@/features/pdfs/queries'

import { SalesOrderDrawerHeaderProps, statusConfig } from '@/features/orders/salesOrders/types'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useFormatSalesOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { useOrderSpots, nameSpots } from '@/features/orders/spots'
import { useSpotPrices } from '@/features/spots/queries'
import { OrderDrawerHeader } from '@/features/orders/ui/OrderDrawerHeader'

export default function AdminSalesOrderDrawerHeader({ order }: SalesOrderDrawerHeaderProps) {
  const downloadInvoice = useDownloadSalesOrderInvoice()

  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  // Display composition, client-side: the rows carry metal_id, the reference
  // read supplies the names the PDF templates print.
  const { data: spotPrices = [] } = useSpotPrices()
  const namedOrderSpots = nameSpots(orderSpots, spotPrices)

  const status = statusConfig[order.status ?? '']
  const Icon = status?.icon

  const downloadOptions = [
    {
      statuses: ['Pending'],
      label: 'Download Invoice Preview',
      onClick: () =>
        downloadInvoice.mutate({ order_id: order.id, order_number: order.number, fileName: 'invoice_preview' }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Preparing', 'In Transit', 'Completed'],
      label: 'Download Invoice',
      onClick: () => downloadInvoice.mutate({ order_id: order.id, order_number: order.number, fileName: 'invoice' }),
      isPending: downloadInvoice.isPending,
    },
  ]

  return (
    <OrderDrawerHeader
      primary={formatFullDate(order.created_at ?? undefined)}
      secondary={formatSalesOrderNumber(order.number)}
      status={order.status}
      icon={status ? Icon : undefined}
      downloads={downloadOptions}
    />
  )
}
