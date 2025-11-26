import { SalesOrderDrawerContentProps, salesOrderServiceOptions } from '@/types/sales-orders'
import { AnimatedScroll } from '@/components/icons/animated'
import { BlurredStagger } from '@/components/ui/blurred-stagger'
import { Confetti, ConfettiRef } from '@/components/ui/confetti'
import { ShineBorder } from '@/components/ui/shine-border'
import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'
import DisplaySalesOrderProducts from './displayProducts'

export default function PreparingSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const confettiRef = useRef<ConfettiRef>(null)

  const arrival = Object.values(salesOrderServiceOptions)
    .find((o) => o.label === order.shipping_service)
    ?.time?.toLowerCase()

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
      <div className="relative flex flex-col items-center gap-4 h-auto justify-center rounded-lg raised-off-page">
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
          <div className="text-2xl text-neutral-800 mb-2">
            <BlurredStagger text={`Your order has been placed!`} delay={2000} />
          </div>
          <div className="text-sm text-neutral-700 mb-6 text-left">
            <BlurredStagger
              text={`Please give our team some time to prepare your for order for shipment. Once your items have been sent, they should arrive within ${arrival}.`}
              delay={2200}
            />
          </div>
          <div className="flex w-full justify-center">
            <AnimatedScroll size={128} className="mb-6 z-1 text-primary" />
          </div>
        </div>
      </div>
      <div className="relative flex flex-col bg-card raised-off-page p-4 rounded-lg">
        <ShineBorder
          shineColor={['#ae8625', '#f5d67d', '#d2ac47', '#edc967', '#ae8625']}
          borderWidth={2}
          className="z-1"
        />
        <DisplaySalesOrderProducts items={order.order_items} />
      </div>
    </div>
  )
}
