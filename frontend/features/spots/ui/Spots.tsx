'use client'

import { NumberFlowGroup } from '@number-flow/react'
import { Amount, Marquee, MarqueeItem } from '@dorado/components'
import { useSpotTypeStore } from '@/shared/store/spotStore'
import { useSpotPrices } from '@dorado/client'

const DELTA_FORMAT = { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' } as const

export default function Spots() {
  const { data: spots } = useSpotPrices()
  const { type } = useSpotTypeStore()

  if (!spots) return null

  return (
    <Marquee>
      {spots.map((spot) => (
        <NumberFlowGroup key={spot.id}>
          <MarqueeItem
            label={spot.id}
            value={<Amount value={(type === 'Bid' ? spot.bid : spot.ask) ?? 0} />}
            delta={<Amount value={spot.dollar_change ?? 0} format={DELTA_FORMAT} />}
            trend={spot.direction}
          />
        </NumberFlowGroup>
      ))}
    </Marquee>
  )
}
