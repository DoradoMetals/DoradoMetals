import { Button } from '@/components/ui/button'
import { useDownloadSalesOrderInvoice } from '@/lib/queries/usePDF'
import { useSalesOrderMetals } from '@/lib/queries/useSalesOrders'

import { SalesOrderDrawerHeaderProps, statusConfig } from '@/types/sales-orders'
import { formatFullDate } from '@/utils/dateFormatting'
import { useFormatSalesOrderNumber } from '@/utils/formatSalesOrderNumber'

export default function SalesOrderDrawerHeader({ order }: SalesOrderDrawerHeaderProps) {
  const downloadInvoice = useDownloadSalesOrderInvoice()

  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()
  const { data: orderSpots = [] } = useSalesOrderMetals(order.id)

  const status = statusConfig[order.sales_order_status]
  const Icon = status?.icon

  const downloadOptions = [
    {
      statuses: ['Pending'],
      label: 'Download Invoice Preview',
      onClick: () =>
        downloadInvoice.mutate({ salesOrder: order, orderSpots, fileName: 'invoice_preview' }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Paid', 'Preparing', 'In Transit', 'Completed'],
      label: 'Download Invoice',
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
        <div className="flex items-center gap-2">
          {status && Icon && (
            <div className={`${status.text_color}`}>
              <Icon size={24} />
            </div>
          )}
          <span className="text-lg text-neutral-800">{order.sales_order_status}</span>
        </div>
        <div className="flex ml-auto">
          {downloadOptions.map(({ statuses, label, onClick, isPending }, index) =>
            statuses.includes(order.sales_order_status) ? (
              <Button
                key={index}
                variant="link"
                className={`font-normal text-sm bg-transparent hover:bg-transparent ${status.text_color} px-0`}
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
