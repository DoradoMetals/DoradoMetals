'use client'

import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import NumberFlow, { NumberFlowGroup } from '@number-flow/react'
import { CaretUp, CaretDown } from '@phosphor-icons/react'
import MobileSpotTicker from './mobileSpots'
import PriceNumberFlow from '../products/PriceNumberFlow'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'

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
                const CaretIcon = trendUp ? CaretUp : CaretDown

                return (
                  <div key={spot.id} className="flex items-center gap-2">
                    <span className="text-neutral-900 text-sm">{spot.type}:</span>

                    <NumberFlowGroup>
                      <div className="text-sm flex font-medium items-center">
                        <PriceNumberFlow value={spot.bid_spot} />
                      </div>

                      <div className="flex items-center text-xs text-neutral-700">
                        <CaretIcon size={14} color={getPrimaryIconStroke()} />
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
