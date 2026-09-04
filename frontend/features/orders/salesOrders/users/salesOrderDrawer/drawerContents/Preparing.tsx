import { SalesOrderDrawerContentProps } from '@/features/orders/salesOrders/types'
import { useSaleShippingServices } from '@/features/shipping/queries'
import { transitLabel } from '@/features/orders/salesOrders/types'
import { AnimatedScroll } from '@/features/orders/ui/Animated'
import { BlurredStagger } from '@/shared/ui/BlurredStagger'
import { Confetti, ConfettiRef } from '@/features/orders/ui/Confetti'
import { ShineBorder } from '@/features/orders/ui/ShineBorder'
import { cn } from '@/shared/utils/cn'
import { useEffect, useRef } from 'react'
import DisplaySalesOrderProducts from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/displayProducts'
import { useSalesOrderLines } from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/useSalesOrderLines'

export default function PreparingSalesOrder({ view }: SalesOrderDrawerContentProps) {
  const { order } = view

  const confettiRef = useRef<ConfettiRef>(null)
  const lines = useSalesOrderLines(view)

  const { data: saleServices = [] } = useSaleShippingServices()
  const arrivalService = saleServices
    // shipping_service is a column of orders.transactions, so it reads off
    // `totals` - the order row never had it. It stores the service's NAME.
    .find((s) => s.name === view.totals?.shipping_service)
  const arrival = arrivalService
    ? transitLabel(arrivalService.min_transit_days, arrivalService.max_transit_days).toLowerCase()
    : undefined

  useEffect(() => {
    confettiRef.current?.fire({
      particleCount: 100,
      angle: 90,
      spread: 90,
      startVelocity: 50,
      decay: 0.88,
      gravity: 0.7,
      ticks: 400,
      origin: { x: 0.5, y: 0.6 },
      colors: ['#ae8625', '#f5d67d', '#d2ac47', '#edc967', '#ae8625'],
      flat: false,
    })
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex flex-col items-center gap-4 h-auto justify-center rounded-lg border border-border">
        <ShineBorder
          shineColor={['#ae8625', '#f5d67d', '#d2ac47', '#edc967', '#ae8625']}
          borderWidth={2}
          className="z-1"
        />
        <div
          className={cn(
            'absolute inset-0 z-0',
            '[background-size:20px_20px]',
            '[background-image:radial-gradient(#d4d4d4_1px,transparent_1px)]',
            'dark:[background-image:radial-gradient(#404040_1px,transparent_1px)]'
          )}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-black rounded-lg" />
        <Confetti ref={confettiRef} className="absolute left-0 top-0 z-0 size-full" manualstart />
        <div className="p-4">
          <BlurredStagger as="h2" className="mb-2" text={`Your order has been placed!`} delay={2000} />
          <BlurredStagger
            as="p"
            className="mb-6 text-left"
            text={`Please give our team some time to prepare your for order for shipment. Once your items have been sent, they should arrive within ${arrival}.`}
            delay={2200}
          />
          <div className="flex w-full justify-center">
            <AnimatedScroll size={128} className="mb-6 z-1 text-primary" />
          </div>
        </div>
      </div>
      <div className="relative flex flex-col border border-border p-4 rounded-lg">
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
