import { Button } from '@/shared/ui/base/button'
import { useDownloadSalesOrderInvoice } from '@/features/pdfs/queries'

import { SalesOrderDrawerHeaderProps, statusConfig } from '@/features/orders/salesOrders/types'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useFormatSalesOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { DownloadIcon } from '@phosphor-icons/react'
import { useOrderSpots, nameSpots } from '@/features/orders/spots'
import { useSpotPrices } from '@/features/spots/queries'

export default function SalesOrderDrawerHeader({ order }: SalesOrderDrawerHeaderProps) {
  const downloadInvoice = useDownloadSalesOrderInvoice()

  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  // Display composition, client-side: the rows carry metal_id, the reference
  // read supplies the names the PDF templates print.
  const { data: spotPrices = [] } = useSpotPrices()
  const namedOrderSpots = nameSpots(orderSpots, spotPrices)

  const Icon = statusConfig[order.status ?? '']?.icon

  const downloadOptions = [
    {
      statuses: ['Pending'],
      label: 'Invoice Preview',
      onClick: () =>
        downloadInvoice.mutate({ order_id: order.id, order_number: order.number, fileName: 'invoice_preview' }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Preparing', 'In Transit', 'Completed'],
      label: 'Invoice',
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
        <div className="flex items-center gap-2 text-primary">
          {Icon && <Icon size={24} />}
          <strong className="stat-sm">{order.status}</strong>
        </div>
        <div className="flex ml-auto">
          {downloadOptions.map(({ statuses, label, onClick, isPending }, index) =>
            statuses.includes(order.status ?? '') ? (
              <Button
                key={index}
                variant="link"
                className='flex items-center justify-start gap-2 px-0'
                onClick={onClick}
                disabled={isPending}
              >
                <DownloadIcon size={20} className="text-primary" />
                {isPending ? 'Loading...' : label}
              </Button>
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}
