'use client'

import { AnimatedScroll } from '@/features/orders/ui/Animated'
import { BlurredStagger } from '@/shared/ui/BlurredStagger'
import { Button } from '@dorado/components'
import { Confetti, ConfettiRef } from '@/features/orders/ui/Confetti'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

export default function Page() {
  const confettiRef = useRef<ConfettiRef>(null)
  const router = useRouter()

  useEffect(() => {
    confettiRef.current?.fire({
      particleCount: 100,
      angle: 90,
      spread: 90,
      startVelocity: 50,
      decay: 0.88,
      gravity: 0.8,
      ticks: 500,
      origin: { x: 0.5, y: 0.6 },
      colors: ['#ae8625', '#f5d67d', '#d2ac47', '#edc967', '#ae8625'],
      flat: false,
    })
  }, [])
  return (
    <main className="flex flex-col justify-center items-center px-4 flex-grow pb-5">
      
      <Confetti ref={confettiRef} className="absolute left-0 top-0 z-0 size-full" manualstart />
      <div className="px-4 flex flex-col items-center h-full w-full justify-center">
        {/* UNBLOCKED. The comment that used to sit here said this could not
            become a heading because BlurredStagger hard-rendered a
            `motion.div`. It takes an `as` now, so the staggered text IS the
            heading and the last type utility in the tree goes with it. */}
        <BlurredStagger as="h1" className="mb-2" text="Your order has been placed!" delay={2000} />

        <div className="flex w-full justify-center">
          <AnimatedScroll size={128} className="mb-6 z-1" />
        </div>
        <BlurredStagger
          as="p"
          className="mb-4"
          text="View your order by clicking the button below."
          delay={3200}
        />
      </div>
      <motion.div
        initial={{
          opacity: 0,
          filter: 'blur(8px)',
          clipPath: 'inset(0 50% 0 50%)',
        }}
        animate={{
          opacity: 1,
          filter: 'blur(0px)',
          clipPath: 'inset(0 0% 0 0%)',
        }}
        transition={{
          duration: 1,
          ease: 'easeOut',
          delay: 2.8,
        }}
        className="w-full max-w-xs p-1"
      >
        <Button
          className="w-full"
          onClick={() => {
            router.push('/account?tab=sold')
          }}
        >
          Go to Orders
        </Button>
      </motion.div>
    </main>
  )
}
