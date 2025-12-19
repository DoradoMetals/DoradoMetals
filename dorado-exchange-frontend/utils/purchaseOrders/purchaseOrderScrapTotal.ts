import { SpotPrice } from '@/types/metal'
import { PurchaseOrderItem } from '@/types/purchase-order'

export default function getPurchaseOrderScrapTotal(
  scrapItems: PurchaseOrderItem[],
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[]
): number {
  return scrapItems.reduce((acc, item) => {
    const orderSpot = orderSpotPrices?.find((s) => s.type === item.scrap?.metal)
    const globalSpot = spotPrices.find((s) => s.type === item.scrap?.metal)

    const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0
    const price = item.price ?? (item?.scrap?.content ?? 0) * (bid_spot * (item.premium ?? 1))
    return acc + price
  }, 0)
}
