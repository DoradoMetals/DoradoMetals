'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'framer-motion'
import { wrap } from '@motionone/utils'
import { CaretUpIcon, CaretDownIcon } from '@phosphor-icons/react'
import { NumberFlowGroup } from '@number-flow/react'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { useSpotPrices } from '@/features/spots/queries'
import Image from 'next/image'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { SpotPrice } from '@/features/spots/types'

export default function AuctionBanner({ type }: { type: 'Bid' | 'Ask' }) {
  const { data: spots } = useSpotPrices()
  if (!spots) return null

  return (
    <div className="flex flex-col items-center gap-0 ml-auto w-full border-y-1 bg-black/75 backdrop-blur-sm shadow-xl">
      <div className="flex items-center w-full bg-primary/65 p-2 border-b-1">
        <div className="border-r-1 pr-2">
          <Image src={'/icons/branding/symbol/white/symbol.png'} height={100} width={100} alt="DME" />
        </div>

        <div className="w-full pl-4">
          <ContactBar />
        </div>
      </div>

      <div className="p-2">
        <SpotBar spots={spots} type={type} />
      </div>
    </div>
  )
}

function ContactBar() {
  return (
    <div className="flex items-center w-full justify-between text-lg text-white">
      <div className="flex items-center gap-1">
        <Image src={'/icons/contact/white/url.svg'} height={20} width={20} alt="URL" />
        <p className="">doradometals.com</p>
      </div>
      <div className="flex items-center gap-1">
        <Image src={'/icons/contact/white/pin.svg'} height={16} width={16} alt="Address" />
        <p>3198 Royal Lane, Dallas, TX</p>
      </div>
      <div className="flex items-center gap-1">
        <Image src={'/icons/contact/white/phone.svg'} height={14} width={14} alt="Phone" />
        <p>{formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}</p>
      </div>
      <div className="flex items-center gap-1">
        <Image src={'/icons/contact/white/email.svg'} height={22} width={22} alt="Email" />
        <p>support@doradometals.com</p>
      </div>
    </div>
  )
}

function SpotBar({ spots, type }: { spots: SpotPrice[]; type: 'Bid' | 'Ask' }) {
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

  return (
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
            <div key={`${spot.id}-${i}`} className="flex items-center gap-2">
              <span className="text-lg text-white/80 uppercase tracking-wide">{spot.type}</span>
              <NumberFlowGroup>
                <div className="text-3xl flex font-bold items-center text-white tabular-nums">
                  <PriceNumberFlow value={type === 'Bid' ? spot.bid_spot : spot.ask_spot} />
                </div>

                <div className="flex items-center gap-1 text-xl tabular-nums">
                  <CaretIcon size={32} className={colorClass} />
                  <PriceNumberFlow value={spot.dollar_change} className={colorClass} />
                </div>
              </NumberFlowGroup>
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}
