import { SpotPrice } from '@/types/metal'
import { Scrap } from '@/types/scrap'
import getScrapPrice from './getScrapPrice'

export default function getPurchaseOrderScrapTotal(
  scrapItems: Scrap[],
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[]
): number {
  return scrapItems.reduce((acc, item) => {
    const orderSpot = orderSpotPrices?.find((s) => s.type === item.metal)
    const globalSpot = spotPrices.find((s) => s.type === item.metal)

    const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0
    const scrap_percentage = orderSpot?.scrap_percentage ?? globalSpot?.scrap_percentage ?? 0

    const price = item.price ?? (item?.content ?? 0) * (bid_spot * scrap_percentage)
    return acc + price
  }, 0)
}
