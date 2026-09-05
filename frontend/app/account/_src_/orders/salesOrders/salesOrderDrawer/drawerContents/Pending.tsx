import { SalesOrderDrawerContentProps } from '@/shared/types/salesOrders'
import DisplaySalesOrderProducts from '@/shared/ui/displayProducts'
import { useSalesOrderLines } from '@/shared/hooks/useSalesOrderLines'

export default function PendingSalesOrder({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  const lines = useSalesOrderLines(view)

  return (
    <div className="relative flex flex-col items-center gap-4 h-full w-full">
      <div className="flex flex-col items-start gap-1">
        <h2>Your order is pending!</h2>
        <small>
          We're waiting on your payment to fully process. Once it does, we will begin preparing your
          order for shipment.
        </small>
      </div>
      <div className="relative flex flex-col border border-border p-4 rounded-lg w-full">
        <DisplaySalesOrderProducts items={lines} />
      </div>
    </div>
  )
}
