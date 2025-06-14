import { AnimatedHandshake } from '@/components/icons/animated'
import { BlurredStagger } from '@/components/ui/blurred-stagger'
import { Confetti, ConfettiRef } from '@/components/ui/confetti'
import { ShineBorder } from '@/components/ui/shine-border'
import { cn } from '@/lib/utils'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { useEffect, useRef } from 'react'

export default function AcceptedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]
  const payout = payoutOptions.find((p) => p.method === order.payout?.method)
  const Icon = payout?.icon
  const confettiRef = useRef<ConfettiRef>(null)

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
      colors: ['#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412'],
      flat: false,
    })
  }, [])

  return (
    <div className="relative flex flex-col items-center gap-4 h-full justify-center rounded-lg raised-off-page">
      <ShineBorder shineColor={['#fb923c', '#f97316', '#ea580c']} borderWidth={2} className="z-1" />
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
          <BlurredStagger
            text={`Offer of  $${order.total_price?.toFixed(2)} accepted!`}
            delay={2000}
          />
        </div>
        <div className="text-sm text-neutral-700 mb-6 text-left">
          <BlurredStagger text="Our team will begin processing your payment shortly." delay={2200} />
        </div>
        <div className="flex w-full justify-center">
          <AnimatedHandshake className={cn(config.text_color, 'mb-6 z-1')} size={128} />
        </div>
      </div>
    </div>
  )
}
