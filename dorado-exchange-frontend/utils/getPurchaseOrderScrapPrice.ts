import { SpotPrice } from '@/types/metal'
import { Scrap } from '@/types/scrap'

export default function getPurchaseOrderScrapPrice(
  item: Scrap,
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[]
): number {
  const orderSpot = orderSpotPrices?.find((s) => s.type === item.metal)
  const globalSpot = spotPrices.find((s) => s.type === item.metal)

  const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0
  const scrap_percentage = orderSpot?.scrap_percentage ?? globalSpot?.scrap_percentage ?? 0

  const price = item.price ?? (item?.content ?? 0) * (bid_spot * scrap_percentage)
  return price
}
