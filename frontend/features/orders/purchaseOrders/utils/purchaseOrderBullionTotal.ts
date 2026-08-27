import { SpotPrice } from '@/features/spots/types'
import { PurchaseOrderItem } from '@/features/orders/purchaseOrders/types'

export default function getPurchaseOrderBullionTotal(
  bullionItems: PurchaseOrderItem[],
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[]
): number {
  return bullionItems.reduce((acc, item) => {
    const orderSpot = orderSpotPrices?.find((s) => s.name === item.product?.metal_type)
    const globalSpot = spotPrices?.find((s) => s.name === item.product?.metal_type)

    const bidSpot = orderSpot?.bid ?? globalSpot?.bid ?? 0
    const price = item.price ?? ((item?.product?.content ?? 0) * ((bidSpot) * (item.premium ?? item?.product?.bid_premium ?? 0)))

    const quantity = item.quantity ?? 1
    return acc + price * quantity
  }, 0)
}
