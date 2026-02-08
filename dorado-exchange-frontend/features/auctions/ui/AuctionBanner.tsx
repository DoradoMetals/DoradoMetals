'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'framer-motion'
import { wrap } from '@motionone/utils'
import { CaretUpIcon, CaretDownIcon } from '@phosphor-icons/react'
import { NumberFlowGroup } from '@number-flow/react'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { useSpotPrices } from '@/features/spots/queries'

export default function AuctionBanner({ type }: { type: 'Bid' | 'Ask' }) {
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
    <div className="overflow-x-auto overflow-y-hidden whitespace-nowrap ml-auto liquid-gold w-full py-1">
      <div className="flex items-center justify-center">
        <div className="overflow-hidden w-full">
          <motion.div
            ref={containerRef}
            className="flex items-end gap-10 w-max px-4 will-change-transform"
            style={{ x }}
          >
            {[...spots, ...spots, ...spots].map((spot, i) => {
              const trendUp = spot.dollar_change >= 0
              const CaretIcon = trendUp ? CaretUpIcon : CaretDownIcon
              const colorClass = trendUp ? 'text-success' : 'text-destructive'

              return (
                <div key={`${spot.id}-${i}`} className="flex items-center gap-2 text-white">
                  <span className="text-xl font-medium uppercase tracking-wide">{spot.type}:</span>
                  <NumberFlowGroup>
                    <div className="text-2xl flex font-medium items-center">
                      <PriceNumberFlow value={type === 'Bid' ? spot.bid_spot : spot.ask_spot} />
                    </div>

                    <div className="flex items-center gap-1 text-lg">
                      <CaretIcon size={16} className={colorClass} />
                      <PriceNumberFlow value={spot.dollar_change} className={colorClass} />
                    </div>
                  </NumberFlowGroup>
                </div>
              )
            })}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
