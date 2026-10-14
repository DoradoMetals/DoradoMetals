'use client'

import type { SpotTicker } from '@dorado/contracts'

import { useSparkline } from '../_api'
import { SpotCard } from './SpotCard'

export function SpotCardItem({
  spot,
  footer,
  href,
}: {
  spot: SpotTicker
  footer: React.ReactNode
  href: string
}) {
  const sparkline = useSparkline(spot.id)
  return <SpotCard spot={spot} sparkline={sparkline} footer={footer} href={href} />
}
