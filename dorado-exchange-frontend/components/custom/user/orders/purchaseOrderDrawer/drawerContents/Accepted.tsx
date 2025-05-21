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
      startVelocity: 30,
      decay: 0.88,
      gravity: 0.7,
      ticks: 400,
      origin: { x: 0.5, y: 0.6 },
      colors: ['#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412'],
      flat: false,
    })
  }, [])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative raised-off-page bg-card w-full rounded-lg overflow-hidden">
        <ShineBorder
          shineColor={['#fb923c', '#f97316', '#ea580c']}
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
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-black"></div>
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
            <AnimatedHandshake className={cn(config.text_color, 'mb-6 z-1')} size={128}/>
          </div>
        </div>
      </div>

      <div className="h-auto w-full p-4 rounded-lg flex flex-col gap-3 raised-off-page bg-card">
        <div className="flex flex-col items-start gap-4 w-full">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1 text-xl text-neutral-800">
              <Icon size={24} className={config.text_color} />
              {payout?.label}
            </div>
            <div className={cn('text-sm', config.text_color)}>{payout?.time_delay}</div>
          </div>

          <div className="w-full">
            {order.payout.method === 'ACH' && (
              <div className="flex flex-col w-full gap-2">
                <div className="flex gap-1 justify-between w-full text-base text-neutral-800 items-center">
                  <div className="flex flex-col text-left">
                    <p>Name:</p>
                    <p>Routing:</p>
                    <p>Account:</p>
                  </div>
                  <div className="flex flex-col text-right">
                    <p>{order.payout.account_holder_name}</p>
                    <p>{order.payout.routing_number}</p>
                    <p>{order.payout.account_number}</p>
                  </div>
                </div>
              </div>
            )}

            {order.payout.method === 'WIRE' && (
              <div className="flex flex-col w-full gap-2">
                <div className="flex gap-1 justify-between w-full text-base text-neutral-800 items-center">
                  <div className="flex flex-col text-left">
                    <p>Name:</p>
                    <p>Routing:</p>
                    <p>Account:</p>
                  </div>
                  <div className="flex flex-col text-right">
                    <p>{order.payout.account_holder_name}</p>
                    <p>{order.payout.routing_number}</p>
                    <p>{order.payout.account_number}</p>
                  </div>
                </div>
              </div>
            )}

            {order.payout.method === 'ECHECK' && (
              <div className="w-full items-center flex justify-between">
                <div className="flex flex-col w-full gap-2 w-full">
                  <div className="flex justify-between w-full text-base text-neutral-800 items-center">
                    <div className="flex flex-col text-left">
                      <p>Name:</p>
                      <p>Email:</p>
                    </div>
                    <div className="flex flex-col text-right">
                      <p>{order.payout.account_holder_name}</p>
                      <p>{order.payout.email_to}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          {order.payout.method === 'ACH' && (
            <div className="text-sm text-neutral-600">
              Once we have initiated your ACH transfer, you will receive it within{' '}
              {payout?.time_delay}. If you have entered the wrong routing or account number, please
              call us immediately. We are not liable for missing payments due to incorrect input.
            </div>
          )}

          {order.payout.method === 'WIRE' && (
            <div className="text-sm text-neutral-600">
              Once we have initiated your wire transfer, you will receive it within
              {payout?.time_delay}. If you have entered the wrong routing or account number, please
              call us immediately. We are not liable for missing payments due to incorrect input.
            </div>
          )}

          {order.payout.method === 'ECHECK' && (
            <div className="text-sm text-neutral-600">
              When we send you your eCheck, you will receive it instantly. You will be able to find
              it in your email inbox, and we will have it available for download here as well.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
