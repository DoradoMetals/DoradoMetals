import { SpotPrice } from '@/types/metal'
import { PurchaseOrderItem } from '@/types/purchase-order'

export default function getPurchaseOrderBullionTotal(
  bullionItems: PurchaseOrderItem[],
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[]
): number {
  return bullionItems.reduce((acc, item) => {
    const orderSpot = orderSpotPrices?.find((s) => s.type === item.product?.metal_type)
    const globalSpot = spotPrices?.find((s) => s.type === item.product?.metal_type)

    const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0
    const price = item.price ?? ((item?.product?.content ?? 0) * ((bid_spot) * (item.premium ?? item?.product?.bid_premium ?? 0)))

    const quantity = item.quantity ?? 1
    return acc + price * quantity
  }, 0)
}
