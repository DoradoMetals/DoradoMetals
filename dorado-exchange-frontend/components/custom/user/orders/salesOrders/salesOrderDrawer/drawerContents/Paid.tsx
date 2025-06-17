'use client'

import { SalesOrderDrawerContentProps, statusConfig } from '@/types/sales-orders'
import DisplaySalesOrderProducts from './displayProducts'

export default function PaidSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const config = statusConfig[order.sales_order_status]

  return (
    <div className="flex flex-col items-center max-w-full h-full rounded-lg gap-4">
      <div className="flex flex-col items-start gap-1 w-full">
        <div className="text-xl text-neutral-800">Your payment is complete.</div>
        <div className="text-sm text-neutral-600">
          Please give our team some time to finalize your payment and start preparing your order.
        </div>
      </div>
      <div className="flex flex-col items-start w-full">
        <div className="text-xs text-neutral-600 tracking-widest">Order Items:</div>{' '}
        <DisplaySalesOrderProducts items={order.order_items} />
      </div>
    </div>
  )
}
