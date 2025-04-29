'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'framer-motion'
import { wrap } from '@motionone/utils'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { NumberFlowGroup } from '@number-flow/react'
import NumberFlow from '@number-flow/react'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import PriceNumberFlow from '../products/PriceNumberFlow'

export default function MobileSpotTicker() {
  const { data: spots } = useSpotPrices()
  const baseX = useMotionValue(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [wrapWidth, setWrapWidth] = useState(0)

  useEffect(() => {
    if (containerRef.current) {
      setWrapWidth(containerRef.current.offsetWidth / 3)
    }
  }, [spots])

  const x = useTransform(baseX, (v) => `${wrap(-wrapWidth, 0, v)}px`)

  useAnimationFrame((_, delta) => {
    const moveBy = -50 * (delta / 1000)
    baseX.set(baseX.get() + moveBy)
  })

  if (!spots) return null

  return (
    <div className="overflow-hidden w-full md:hidden">
      <motion.div ref={containerRef} className="flex items-end gap-8 w-max px-4" style={{ x }}>
        {[...spots, ...spots, ...spots].map((spot, i) => {
          const trendUp = spot.dollar_change >= 0
          const ChevronIcon = trendUp ? ChevronUp : ChevronDown

          return (
            <div key={`${spot.id}-${i}`} className="flex items-center gap-2 text-xs">
              <span className="text-sm text-neutral-900 ">{spot.type}:</span>
              <NumberFlowGroup>
                <div className="text-primary font-medium flex items-end">
                  <PriceNumberFlow value={spot.bid_spot} />
                </div>

                <div className="flex items-center gap-0.5 text-neutral-900 ">
                  <ChevronIcon size={14} className="text-primary" />
                  <PriceNumberFlow value={spot.dollar_change} />
                </div>
              </NumberFlowGroup>
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}
