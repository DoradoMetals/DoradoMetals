'use client'

import { NumberFlowGroup } from '@number-flow/react'
import { CaretUpIcon, CaretDownIcon, SwapIcon } from '@phosphor-icons/react'
import { Button } from '@dorado/components'
import { useSpotTypeStore } from '@/shared/store/spotStore'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import MobileSpotTicker from '@/features/spots/ui/MobileSpots'
import { useSpotPrices } from '@/features/spots/queries'

export default function Spots() {
  const { data: spots } = useSpotPrices()
  const { type, toggleType } = useSpotTypeStore()

  return (
    <>
      {/* THE ONE PLACE A CALL SITE STILL NAMES A TEXT COLOUR, and it is
          deliberate: this strip is the only surface in the app that is not the
          page ground. `liquid-gold` is retired (DELETION-ORDER maps it to
          `bg-brand`), and every semantic tag in typography.css colours itself
          for the DARK ground - `<p>`/`<small>` resolve to --muted-foreground,
          which is unreadable on gold. So the bar sets the on-brand foreground
          ONCE here and its text leaves stay bare `<span>`s that inherit it
          (ruling 22, case 2). See the report: a full-bleed --brand bar also
          collides with ruling 19 and with the success/destructive trend
          colours it has to display, and wants Jacob's eye. */}
      <div className="overflow-x-auto overflow-y-hidden whitespace-nowrap ml-auto bg-brand text-primary-foreground w-full py-1">
        <div className="flex items-center justify-center">
          {spots && (
            <div className="hidden md:flex items-center justify-between max-w-7xl w-full">
              <div className="flex items-center w-full justify-between ml-auto">
                <Button
                  variant="primary"

                  className="flex items-center gap-1 p-0 m-0 h-4"
                  onClick={() => toggleType()}
                >
                  <SwapIcon size={20} />
                  Show {type === 'Bid' ? 'Ask' : 'Bid'}
                </Button>
                {spots.map((spot) => {
                  const trendUp = (spot.dollar_change ?? 0) >= 0
                  const CaretIcon = trendUp ? CaretUpIcon : CaretDownIcon
                  const colorClass = trendUp ? 'text-success' : 'text-destructive'

                  return (
                    <div key={spot.id} className="flex items-center gap-3">
                      <span className="uppercase">{spot.name}:</span>

                      <NumberFlowGroup>
                        <div className="flex items-center">
                          <PriceNumberFlow value={(type === 'Bid' ? spot.bid : spot.ask) ?? 0} />
                        </div>

                        <div className="flex items-center gap-1">
                          <CaretIcon size={16} className={colorClass} />
                          <PriceNumberFlow value={spot.dollar_change ?? 0} className={colorClass} />
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
