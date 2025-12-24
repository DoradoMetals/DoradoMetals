'use client'

import { NumberFlowGroup } from '@number-flow/react'
import { CaretUpIcon, CaretDownIcon, SwapIcon } from '@phosphor-icons/react'
import { Button } from '@/shared/ui/base/button'
import { useSpotTypeStore } from '@/shared/store/spotStore'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import MobileSpotTicker from '@/features/spots/ui/MobileSpots'
import { useSpotPrices } from '@/features/spots/queries'

export default function Spots() {
  const { data: spots } = useSpotPrices()
  const { type, toggleType } = useSpotTypeStore()

  return (
    <>
      <div className="overflow-x-auto overflow-y-hidden whitespace-nowrap ml-auto liquid-gold w-full py-1">
        <div className="flex items-center justify-center">
          {spots && (
            <div className="hidden md:flex items-center justify-between max-w-7xl w-full">
              <div className="flex items-center w-full justify-between ml-auto text-white">
                <Button
                  variant="ghost"
                  className="flex items-center gap-1 p-0 m-0 h-4 text-sm text-white hover:text-white"
                  onClick={() => toggleType()}
                >
                  <SwapIcon size={20} />
                  Show {type === 'Bid' ? 'Ask' : 'Bid'}
                </Button>
                {spots.map((spot) => {
                  const trendUp = spot.dollar_change >= 0
                  const CaretIcon = trendUp ? CaretUpIcon : CaretDownIcon
                  const colorClass = trendUp ? 'text-success' : 'text-destructive'

                  return (
                    <div key={spot.id} className="flex items-center gap-3">
                      <span className="text-sm font-medium uppercase">
                        {spot.type}:
                      </span>

                      <NumberFlowGroup>
                        <div className="text-sm flex font-medium items-center tracking-wide">
                          <PriceNumberFlow value={type === 'Bid' ? spot.bid_spot : spot.ask_spot} />
                        </div>

                        <div className="flex items-center gap-1 text-xs">
                          <CaretIcon size={16} className={colorClass} />
                          <PriceNumberFlow value={spot.dollar_change} className={colorClass} />
                        </div>
                      </NumberFlowGroup>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {spots && (
            <div className="flex flex-col sm:hidden items-start gap-1">
              <MobileSpotTicker type={type} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
