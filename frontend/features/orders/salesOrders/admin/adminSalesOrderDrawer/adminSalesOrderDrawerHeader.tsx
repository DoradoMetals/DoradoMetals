import { Button } from '@/shared/ui/base/button'
import { useDownloadSalesOrderInvoice } from '@/features/pdfs/queries'

import { SalesOrderDrawerHeaderProps, statusConfig } from '@/features/orders/salesOrders/types'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useFormatSalesOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { useOrderSpots, nameSpots } from '@/features/orders/spots'
import { useSpotPrices } from '@/features/spots/queries'

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
    <div className="flex flex-col w-full border-b-1 gap-3 border-border">
      <div className="flex w-full justify-between items-center">
        <strong>{formatFullDate(order.created_at ?? undefined)}</strong>

        <small>{formatSalesOrderNumber(order.number)}</small>
      </div>
      <div className="flex w-full justify-between items-center">
        <div className="flex items-center gap-2">
          {status && Icon && (
            <div className={`${'text-primary'}`}>
              <Icon size={24} />
            </div>
          )}
          <strong className="stat-sm">{order.status}</strong>
        </div>
        <div className="flex ml-auto">
          {downloadOptions.map(({ statuses, label, onClick, isPending }, index) =>
            statuses.includes(order.status ?? '') ? (
              <Button
                key={index}
                variant="link"
                className="px-0"
                onClick={onClick}
                disabled={isPending}
              >
                {isPending ? 'Loading...' : label}
              </Button>
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}
