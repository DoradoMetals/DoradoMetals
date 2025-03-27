'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'framer-motion'
import { wrap } from '@motionone/utils'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { NumberFlowGroup } from '@number-flow/react'
import NumberFlow from '@number-flow/react'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'

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
      <motion.div ref={containerRef} className="flex gap-8 w-max px-4" style={{ x }}>
        {[...spots, ...spots, ...spots].map((spot, i) => {
          const trendUp = spot.dollar_change >= 0
          const ChevronIcon = trendUp ? ChevronUp : ChevronDown

          return (
            <div key={`${spot.id}-${i}`} className="flex items-center gap-2 text-xs">
              <span className="text-primary">{spot.type}:</span>

              <NumberFlowGroup>
                <div className="text-neutral-700 flex items-center gap-0.5">
                  <NumberFlow
                    value={spot.bid_spot}
                    format={{
                      style: 'currency',
                      currency: 'USD',
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }}
                    opacityTiming={{ duration: 250, easing: 'ease-out' }}
                    transformTiming={{
                      easing: `linear(0, 0.0033 0.8%, 0.0263 2.39%, 0.0896 4.77%, 0.4676 15.12%, 0.5688, 0.6553, 0.7274, 0.7862, 0.8336 31.04%, 0.8793, 0.9132 38.99%, 0.9421 43.77%, 0.9642 49.34%, 0.9796 55.71%, 0.9893 62.87%, 0.9952 71.62%, 0.9983 82.76%, 0.9996 99.47%)`,
                      duration: 500,
                    }}
                    spinTiming={{ duration: 150, easing: 'ease-out' }}
                  />
                </div>

                <div className="flex items-center gap-0.5 text-neutral-600">
                  <ChevronIcon size={14} className="text-secondary" fill="currentColor" />
                  <NumberFlow
                    value={spot.dollar_change}
                    format={{
                      style: 'currency',
                      currency: 'USD',
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }}
                    opacityTiming={{ duration: 250, easing: 'ease-out' }}
                    transformTiming={{
                      easing: `linear(0, 0.0033 0.8%, 0.0263 2.39%, 0.0896 4.77%, 0.4676 15.12%, 0.5688, 0.6553, 0.7274, 0.7862, 0.8336 31.04%, 0.8793, 0.9132 38.99%, 0.9421 43.77%, 0.9642 49.34%, 0.9796 55.71%, 0.9893 62.87%, 0.9952 71.62%, 0.9983 82.76%, 0.9996 99.47%)`,
                      duration: 500,
                    }}
                    spinTiming={{ duration: 150, easing: 'ease-out' }}
                  />
                </div>
              </NumberFlowGroup>
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}
