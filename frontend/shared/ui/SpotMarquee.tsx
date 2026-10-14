'use client'

import { useSpotTicker } from '@dorado/client'
import { Marquee, MarqueeItem, useMediaUp } from '@dorado/components'

const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const change = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export function SpotMarquee() {
  const desktop = useMediaUp('md')
  const rows = useSpotTicker().data ?? []
  return (
    <Marquee layout={desktop ? 'desktop' : 'mobile'} label="Live spot prices">
      {rows.map((row) => (
        <MarqueeItem
          key={row.metal_id}
          label={row.metal_id}
          value={row.price == null ? '—' : price.format(row.price)}
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
