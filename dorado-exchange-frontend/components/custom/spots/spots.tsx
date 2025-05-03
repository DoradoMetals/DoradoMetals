'use client'

import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import MobileSpotTicker from './mobileSpots'
import PriceNumberFlow from '../products/PriceNumberFlow'

export default function Spots() {
  const { data: spots } = useSpotPrices()

  return (
    <>
      <div className="w-screen py-2 overflow-x-auto overflow-y-hidden whitespace-nowrap">
        {spots && (
          <div className="hidden md:flex items-end sm:px-25">
            <div className="flex items-end gap-10 ml-auto">
              {spots.map((spot) => {
                const trendUp = spot.dollar_change >= 0
                const ChevronIcon = trendUp ? ChevronUp : ChevronDown

                return (
                  <div key={spot.id} className="flex items-center gap-2">
                    <span className="text-neutral-900 text-sm">{spot.type}:</span>

                    <NumberFlowGroup>
                      <div className="text-sm flex font-medium items-center">
                        <PriceNumberFlow className="" value={spot.bid_spot} />
                      </div>

                      <div className="flex items-center text-xs text-neutral-700">
                        <ChevronIcon size={14} className="text-primary" />
                        <PriceNumberFlow value={spot.dollar_change} />
                      </div>
                    </NumberFlowGroup>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {spots && <MobileSpotTicker />}
      </div>
    </>
  )
}
