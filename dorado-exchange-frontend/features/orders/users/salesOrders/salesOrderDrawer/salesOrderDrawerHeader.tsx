import { Button } from '@/shared/ui/base/button'
import { useDownloadSalesOrderInvoice } from '@/lib/queries/usePDF'
import { useSalesOrderMetals } from '@/lib/queries/useSalesOrders'

import { SalesOrderDrawerHeaderProps, statusConfig } from '@/types/sales-orders'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useFormatSalesOrderNumber } from '@/utils/formatting/order-numbers'
import { DownloadIcon } from '@phosphor-icons/react'

export default function SalesOrderDrawerHeader({ order }: SalesOrderDrawerHeaderProps) {
  const downloadInvoice = useDownloadSalesOrderInvoice()

  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()
  const { data: orderSpots = [] } = useSalesOrderMetals(order.id)

  const Icon = statusConfig[order.sales_order_status].icon

  const downloadOptions = [
    {
      statuses: ['Pending'],
      label: 'Invoice Preview',
      onClick: () =>
        downloadInvoice.mutate({ salesOrder: order, orderSpots, fileName: 'invoice_preview' }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Preparing', 'In Transit', 'Completed'],
      label: 'Invoice',
      onClick: () => downloadInvoice.mutate({ salesOrder: order, orderSpots, fileName: 'invoice' }),
      isPending: downloadInvoice.isPending,
    },
  ]

  return (
    <div className="flex flex-col w-full border-b-1 gap-3 border-border">
      <div className="flex w-full justify-between items-center">
        <div className="text-base text-neutral-800">{formatFullDate(order.created_at)}</div>

        <div className="text-sm text-neutral-700">{formatSalesOrderNumber(order.order_number)}</div>
      </div>
      <div className="flex w-full justify-between items-center">
        <div className="flex items-center gap-2 text-primary">
          {Icon && <Icon size={24} />}
          <span className="text-lg text-neutral-800">{order.sales_order_status}</span>
        </div>
        <div className="flex ml-auto">
          {downloadOptions.map(({ statuses, label, onClick, isPending }, index) =>
            statuses.includes(order.sales_order_status) ? (
              <Button
                key={index}
                variant="link"
                className='flex items-center justify-start gap-2 text-sm bg-transparent px-0'
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
