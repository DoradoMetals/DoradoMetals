'use client'
import React, { ReactNode, useEffect } from 'react'
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion'
import { cn } from '@/lib/utils'

export function FloatingNav({
  children,
  className,
  visible,
  setVisible,
}: {
  children?: ReactNode
  className?: string
  visible: boolean
  setVisible: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const { scrollYProgress } = useScroll()
  const hasScrollbar = document.documentElement.scrollHeight > document.documentElement.clientHeight

  useMotionValueEvent(scrollYProgress, 'change', (current) => {
    const prev = scrollYProgress.getPrevious() ?? current
    if (typeof current !== 'number' || typeof prev !== 'number') return

    if (current > 0.5) {
      setVisible(false)
      return
    }
    setVisible(current - prev < 0)
  })

  useEffect(() => {
    if (!hasScrollbar) {
      setVisible(true)
    } else {
      const atTop = window.scrollY <= 0
      setVisible(atTop)
    }
  }, [setVisible, hasScrollbar])

  return (
    <AnimatePresence initial={false}>
      <motion.div
        initial={{
          opacity: 1,
          y: -100,
        }}
        animate={{
          y: visible ? 0 : -100,
          opacity: visible ? 1 : 0,
        }}
        transition={{
          duration: 0.2,
        }}
        className={cn('sticky flex items-center justify-center', className)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
