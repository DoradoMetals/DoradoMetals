import { SpotPrice } from '@/features/spots/types'
import { PurchaseOrderItem } from '@/features/orders/purchaseOrders/types'

export default function getPurchaseOrderScrapPrice(
  item: PurchaseOrderItem,
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[]
): number {
  const orderSpot = orderSpotPrices?.find((s) => s.type === item?.scrap?.metal)
  const globalSpot = spotPrices.find((s) => s.type === item?.scrap?.metal)

  const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0

  const price = item.price ?? (item?.scrap?.content ?? 0) * (bid_spot * (item?.premium ?? item?.scrap?.bid_premium ?? 1))
  return price
}
