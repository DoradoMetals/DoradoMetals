import { AnimatedHandshake } from '@/features/orders/ui/Animated'
import { BlurredStagger } from '@/shared/ui/BlurredStagger'
import { Confetti, ConfettiRef } from '@/features/orders/ui/Confetti'
import { PurchaseOrderDrawerContentProps } from '@/types/purchase-order'
import { useEffect, useRef } from 'react'

export default function AcceptedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
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
      colors: ['#ae8625', '#f5d67d', '#d2ac47', '#edc967', '#ae8625'],
      flat: false,
    })
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 h-full justify-center">
      <Confetti ref={confettiRef} className="absolute left-0 top-0 z-0 size-full" manualstart />
      <div className="p-4">
        <div className="text-2xl text-neutral-800 mb-2">
          <BlurredStagger
            text={`Offer of  $${order.total_price?.toFixed(2)} accepted!`}
            delay={2000}
          />
        </div>
        <div className="text-sm text-neutral-700 mb-6 text-left">
          <BlurredStagger
            text="Our team will begin processing your payment shortly."
            delay={2200}
          />
        </div>
        <div className="flex w-full justify-center">
          <AnimatedHandshake className="mb-6 z-1 text-primary" size={128} />
        </div>
      </div>
    </div>
  )
}
