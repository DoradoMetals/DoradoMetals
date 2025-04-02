import { SpotPrice } from '@/lib/queries/useSpotPrices'
import { Scrap } from '@/types/scrap'

export default function getScrapPrice(scrap: Scrap, spot?: SpotPrice): number {
  if (!spot || !scrap.content) return 0
  return scrap.content * spot.bid_spot
}