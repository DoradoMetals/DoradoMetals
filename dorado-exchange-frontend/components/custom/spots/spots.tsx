'use client'

import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { NumberFlowGroup } from '@number-flow/react'
import { CaretUpIcon, CaretDownIcon, SwapIcon } from '@phosphor-icons/react'
import MobileSpotTicker from './mobileSpots'
import PriceNumberFlow from '../products/PriceNumberFlow'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { Button } from '@/components/ui/button'
import { useSpotTypeStore } from '@/store/spotStore'

export default function Spots() {
  const { data: spots } = useSpotPrices()
  const {type, toggleType} = useSpotTypeStore()

  return (
    <>
      <div className="w-screen py-2 overflow-x-auto overflow-y-hidden whitespace-nowrap h-10">
        {spots && (
          <div className="hidden md:flex items-center sm:px-22">
            <div className="flex items-center gap-10 ml-auto">
              {spots.map((spot) => {
                const trendUp = spot.dollar_change >= 0
                const CaretIcon = trendUp ? CaretUpIcon : CaretDownIcon

                return (
                  <div key={spot.id} className="flex items-center gap-2">
                    <span className="text-neutral-900 text-sm">{spot.type}:</span>

                    <NumberFlowGroup>
                      <div className="text-sm flex font-medium items-center">
                        <PriceNumberFlow value={type === 'Bid' ? spot.bid_spot : spot.ask_spot} />
                      </div>

                      <div className="flex items-center text-xs text-neutral-700">
                        <CaretIcon size={14} color={getPrimaryIconStroke()} />
                        <PriceNumberFlow value={spot.dollar_change} />
                      </div>
                    </NumberFlowGroup>
                  </div>
                )
              })}
              <Button
                variant="ghost"
                className="flex items-center gap-1 text-primary-gradient p-0 m-0 h-4 text-sm"
                onClick={() => toggleType()}
              >
                <SwapIcon size={20} color={getPrimaryIconStroke()} />
                Show {type === 'Bid' ? 'Ask' : 'Bid'}
              </Button>
            </div>
          </div>
        )}
        {spots && (
          <div className="flex flex-col sm:hidden items-start gap-1">
            <MobileSpotTicker type={type} />
          </div>
        )}
      </div>
    </>
  )
}
