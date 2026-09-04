'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'framer-motion'
import { wrap } from '@motionone/utils'
import { ChevronUp, ChevronDown } from '@dorado/components'
import { NumberFlowGroup } from '@number-flow/react'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { cn } from '@/shared/utils/cn'
import { useSpotPrices } from '@dorado/client'

export default function MobileSpotTicker({ type }: { type: 'Bid' | 'Ask' }) {
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
      <motion.div
        ref={containerRef}
        className="flex items-end gap-10 w-max px-4 will-change-transform"
        style={{ x }}
      >
        {[...spots, ...spots, ...spots].map((spot, i) => {
          // The server says which way it moved (see Spots.tsx).
          const CaretIcon = spot.direction === 'down' ? ChevronDown : ChevronUp
          const colorClass =
            spot.direction === 'flat'
              ? 'text-primary-foreground'
              : spot.direction === 'up'
                ? 'text-success'
                : 'text-destructive'

          // Rides inside the --brand ticker bar (see Spots.tsx), so it carries
          // the on-brand foreground and its leaves stay bare spans rather than
          // semantic tags coloured for the page ground.
          return (
            <div key={`${spot.id}-${i}`} className="flex items-center gap-2 text-primary-foreground">
              <span className="uppercase">{spot.name}:</span>
              <NumberFlowGroup>
                <div className="flex items-center">
                  <PriceNumberFlow
                    value={(type === 'Bid' ? spot.bid : spot.ask) ?? 0}
                    className="tabular-nums"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <CaretIcon size={16} className={colorClass} />
                  <PriceNumberFlow
                    value={spot.dollar_change ?? 0}
                    className={cn(colorClass, 'tabular-nums')}
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
