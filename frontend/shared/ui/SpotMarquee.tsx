'use client'

import { useEffect, useState } from 'react'
import { useSpotTicker } from '@dorado/client'
import { Button, Marquee, MarqueeItem, useMediaUp } from '@dorado/components'

const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const change = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export const BID_ASK_KEY = 'dorado.spots.bid-ask'

const readBidAsk = (): boolean => {
  try {
    return window.localStorage.getItem(BID_ASK_KEY) === 'on'
  } catch {
    return false
  }
}

const writeBidAsk = (on: boolean) => {
  try {
    window.localStorage.setItem(BID_ASK_KEY, on ? 'on' : 'off')
  } catch {
    return
  }
}

const money = (value: number | null | undefined) => (value == null ? '—' : price.format(value))

export function SpotMarquee() {
  const desktop = useMediaUp('md')
  const rows = useSpotTicker().data ?? []
  const [bidAsk, setBidAsk] = useState(false)

  useEffect(() => setBidAsk(readBidAsk()), [])

  const both = desktop && bidAsk
  const toggle = () => {
    writeBidAsk(!bidAsk)
    setBidAsk(!bidAsk)
  }

  return (
    <Marquee
      layout={desktop ? 'desktop' : 'mobile'}
      label="Live spot prices"
      leading={
        desktop ? (
          <Button variant="tertiary" size="sm" aria-pressed={bidAsk} onClick={toggle}>
            {bidAsk ? 'Hide bid/ask' : 'Show bid/ask'}
          </Button>
        ) : undefined
      }
    >
      {rows.map((row) => (
        <MarqueeItem
          key={row.metal_id}
          label={row.metal_id}
          value={money(row.price)}
          ask={both ? money(row.ask) : undefined}
          delta={
            row.price == null || row.percent_change == null
              ? undefined
              : `${change.format(row.percent_change)}%`
          }
          trend={row.price == null ? 'flat' : row.direction}
        />
      ))}
    </Marquee>
  )
}
