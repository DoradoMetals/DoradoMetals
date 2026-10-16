'use client'

import { useEffect, useState } from 'react'
import { useSpotTicker } from '@dorado/client'
import {
  Button,
  Marquee,
  MarqueeItem,
  Tooltip,
  TooltipProvider,
  useMediaUp,
} from '@dorado/components'
import { ArrowLeftRight } from '@dorado/icons'

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
  const [showBid, setShowBid] = useState(false)

  useEffect(() => setShowBid(readBidAsk()), [])

  const bid = desktop && showBid
  const toggle = () => {
    writeBidAsk(!showBid)
    setShowBid(!showBid)
  }

  return (
    <Marquee
      layout={desktop ? 'desktop' : 'mobile'}
      label="Live spot prices"
      leading={
        desktop ? (
          <TooltipProvider>
            <Tooltip content={showBid ? 'Show ask' : 'Show bid'}>
              <Button
                variant="tertiary"
                intent="neutral"
                size="iconSm"
                icon={ArrowLeftRight}
                iconSize={16}
                aria-label={showBid ? 'Show ask' : 'Show bid'}
                onClick={toggle}
              />
            </Tooltip>
          </TooltipProvider>
        ) : undefined
      }
    >
      {rows.map((row) => (
        <MarqueeItem
          key={row.metal_id}
          label={row.metal_id}
          value={money(bid ? row.price : row.ask)}
          delta={
            (bid ? row.price : row.ask) == null || row.percent_change == null
              ? undefined
              : `${change.format(row.percent_change)}%`
          }
          trend={(bid ? row.price : row.ask) == null ? 'flat' : row.direction}
        />
      ))}
    </Marquee>
  )
}
