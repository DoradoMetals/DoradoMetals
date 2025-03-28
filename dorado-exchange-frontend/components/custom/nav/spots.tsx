'use client'

import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { ChevronUp, ChevronDown, Phone, Mail } from 'lucide-react'
import clsx from 'clsx'

import { GoldIcon, SilverIcon, PlatinumIcon, PalladiumIcon } from '@/components/icons/logo'
import { ReactNode } from 'react'
import Link from 'next/link'
import MobileSpotTicker from './mobileSpots'

const metalIcons: Record<string, ReactNode> = {
  // Gold: <GoldIcon className="text-secondary" size={32} />,
  // Silver: <SilverIcon className="text-secondary" size={32} />,
  // Platinum: <PlatinumIcon className="text-secondary" size={32} />,
  // Palladium: <PalladiumIcon className="text-secondary" size={32} />,

  Gold: <GoldIcon className="text-primary" size={24} />,
  Silver: <SilverIcon className="text-primary" size={24} />,
  Platinum: <PlatinumIcon className="text-primary" size={24} />,
  Palladium: <PalladiumIcon className="text-primary" size={24} />,
}

export default function Spots() {
  const { data: spots } = useSpotPrices()

  const renderSpots = () => {}

  return (
    <>
      {spots && (
        <div className="w-screen bg-highest py-2 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b-1 border-primary">
          <div className="hidden md:flex items-center sm:px-20 ">
            <div className="flex items-center gap-10 ml-auto justify-start">
              {spots.map((spot) => {
                const trendUp = spot.dollar_change >= 0
                const ChevronIcon = trendUp ? ChevronUp : ChevronDown

                return (
                  <div key={spot.id} className="flex items-center gap-2 font-mono">
                    {/* {metalIcons[spot.type] ?? (
                      <span className="text-secondary text-sm">{spot.type}:</span>
                    )} */}
                    <span className="text-primary text-sm">{spot.type}:</span>

                    <div className="flex items-center gap-2">
                      <NumberFlowGroup>
                        <div className="text-sm flex text-neutral-700 items-center gap-0.5">
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

                        <div className="flex items-center gap-0.5 text-xs text-neutral-600">
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
                  </div>
                )
              })}
            </div>
          </div>

          {spots && <MobileSpotTicker />}
        </div>
      )}
    </>
  )
}
