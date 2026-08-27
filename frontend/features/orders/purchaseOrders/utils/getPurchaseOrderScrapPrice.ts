import { SpotPrice } from '@/features/spots/types'
import { PurchaseOrderItem } from '@/features/orders/purchaseOrders/types'

export default function getPurchaseOrderScrapPrice(
  item: PurchaseOrderItem,
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[]
): number {
  const orderSpot = orderSpotPrices?.find((s) => s.name === item?.scrap?.metal)
  const globalSpot = spotPrices.find((s) => s.name === item?.scrap?.metal)

  const bidSpot = orderSpot?.bid ?? globalSpot?.bid ?? 0

  const price = item.price ?? (item?.scrap?.content ?? 0) * (bidSpot * (item?.premium ?? item?.scrap?.bid_premium ?? 1))
  return price
}
