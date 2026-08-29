import { SalesOrderDrawerContentProps } from '@/features/orders/salesOrders/types'
import DisplaySalesOrderProducts from './displayProducts'
import { ShineBorder } from '@/features/orders/ui/ShineBorder'
import { useSalesOrderLines } from './useSalesOrderLines'

export default function PendingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const lines = useSalesOrderLines(order.id)

  return (
    <div className="relative flex flex-col items-center gap-4 h-full w-full">
      <div className="flex flex-col items-start gap-1">
        <h2>Your order is pending!</h2>
        <small>
          We're waiting on your payment to fully process. Once it does, we will begin preparing your order for shipment.
        </small>
      </div>
      <div className="relative flex flex-col border border-border p-4 rounded-lg w-full">
        <ShineBorder
          shineColor={['#ae8625', '#f5d67d', '#d2ac47', '#edc967', '#ae8625']}
          borderWidth={2}
          className="z-1"
        />
        <DisplaySalesOrderProducts items={lines} />
      </div>
    </div>
  )
}
