'use client'
import { Scroll } from '@dorado/icons'

import { Button } from '@dorado/components'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

export default function Page() {
  const router = useRouter()
  return (
    <main className="flex flex-col justify-center items-center px-4 flex-grow pb-5">
      <div className="px-4 flex flex-col items-center h-full w-full justify-center">
        <h1 className="mb-2">Your order has been placed!</h1>

        <div className="flex w-full justify-center">
          <Scroll size={128} className="mb-6 z-1" aria-hidden />
        </div>
        <p className="mb-4">View your order by clicking the button below.</p>
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
