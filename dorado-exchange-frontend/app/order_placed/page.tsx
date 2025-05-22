'use client'

import { AnimatedScroll } from '@/components/icons/animated'
import { BlurredStagger } from '@/components/ui/blurred-stagger'
import { Button } from '@/components/ui/button'
import { Confetti, ConfettiRef } from '@/components/ui/confetti'
import { ShineBorder } from '@/components/ui/shine-border'
import { cn } from '@/lib/utils'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
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
    <div className="flex flex-col justify-center items-center px-4 flex-grow pb-5">
      <Confetti ref={confettiRef} className="absolute left-0 top-0 z-0 size-full" manualstart />
      <div className="px-4 flex flex-col items-center h-full w-full justify-center">
        <div className="text-2xl text-neutral-800 mb-2">
          <BlurredStagger text="Your order has been placed!" delay={2000} />
        </div>

        <div className="flex w-full justify-center">
          <AnimatedScroll size={128} className="mb-6 z-1" color={getPrimaryIconStroke()} />
        </div>
        <div className="text-sm text-neutral-700 mb-4">
          <BlurredStagger text="View your order by clicking the button below." delay={3200} />
      </div>
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
          className="liquid-gold raised-off-page w-full text-white hover:text-white"
          onClick={() => {
            router.push('/orders')
          }}
        >
          Go to Orders
        </Button>
      </motion.div>
    </div>
  )
}
