'use client'

import { cn } from '@/lib/utils'
import { SalesOrderDrawerContentProps, statusConfig } from '@/types/sales-orders'

export default function PaidSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const config = statusConfig[order.sales_order_status]

  return (
    <div className="flex flex-col items-center justify-center sm:px-6 w-full h-full p-4 rounded-lg"></div>
  )
}
