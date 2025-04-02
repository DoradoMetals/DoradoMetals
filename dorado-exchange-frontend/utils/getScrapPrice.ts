import { SpotPrice } from '@/lib/queries/useSpotPrices'

export default function getScrapPrice(content: number, spot?: SpotPrice): number {
  if (!spot || !content) return 0
  return content * spot.bid_spot
}