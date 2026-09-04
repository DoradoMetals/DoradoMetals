import { Scroll } from '@dorado/components'
import { SalesOrderDrawerContentProps } from '@/features/orders/salesOrders/types'
import { useSaleShippingServices } from '@dorado/client'
import { transitLabel } from '@/features/orders/salesOrders/types'
import { cn } from '@/shared/utils/cn'
import { useEffect, useRef } from 'react'
import DisplaySalesOrderProducts from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/displayProducts'
import { useSalesOrderLines } from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/useSalesOrderLines'

export default function PreparingSalesOrder({ view }: SalesOrderDrawerContentProps) {
  const { order } = view
  const lines = useSalesOrderLines(view)

  const { data: saleServices = [] } = useSaleShippingServices()
  const arrivalService = saleServices
    // shipping_service is a column of orders.transactions, so it reads off
    // `totals` - the order row never had it. It stores the service's NAME.
    .find((s) => s.name === view.totals?.shipping_service)
  const arrival = arrivalService
    ? transitLabel(arrivalService.min_transit_days, arrivalService.max_transit_days).toLowerCase()
    : undefined

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex flex-col items-center gap-4 h-auto justify-center rounded-lg border border-border">
        <div
          className={cn(
            'absolute inset-0 z-0',
            '[background-size:20px_20px]',
            '[background-image:radial-gradient(#d4d4d4_1px,transparent_1px)]',
            'dark:[background-image:radial-gradient(#404040_1px,transparent_1px)]'
          )}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-black rounded-lg" />
        <div className="p-4">
          <h2 className="mb-2">Your order has been placed!</h2>
          <p className="mb-6 text-left">{`Please give our team some time to prepare your for order for shipment. Once your items have been sent, they should arrive within ${arrival}.`}</p>
          <div className="flex w-full justify-center">
            <Scroll size={128} className="mb-6 z-1 text-primary" aria-hidden />
          </div>
        </div>
      </div>
      <div className="relative flex flex-col border border-border p-4 rounded-lg">
        <DisplaySalesOrderProducts items={lines} />
      </div>
    </div>
  )
}
