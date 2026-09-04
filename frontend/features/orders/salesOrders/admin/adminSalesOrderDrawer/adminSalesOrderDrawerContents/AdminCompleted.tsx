import { cn } from '@/shared/utils/cn'
import { SalesOrderDrawerContentProps, statusConfig } from '@/features/orders/salesOrders/types'

export default function AdminCompletedSalesOrder({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  const config = statusConfig[order.status ?? '']

  return (
    <>
      <div className="flex flex-col items-center justify-center sm:px-6 w-full h-full">
        <config.icon className={cn('text-primary', 'mb-6')} size={128} strokeWidth={1.5} />
        <h2 className="mb-2">Order Complete!</h2>
      </div>
    </>
  )
}
