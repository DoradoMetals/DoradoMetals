import { SpotPrice } from '@/features/spots/types'
import { PurchaseOrderItem } from '@/features/orders/purchaseOrders/types'

export default function getPurchaseOrderItemPrice(
  item: PurchaseOrderItem,
  spots: SpotPrice[]
): number {
  const spot = spots.find((s) => s.type === (item.product?.metal_type ?? item.scrap?.metal))!
  return (
    (item?.product?.content ?? item?.scrap?.content ?? 1) *
    (spot.bid_spot * (item.premium ?? item?.product?.bid_premium ?? item?.scrap?.bid_premium ?? 1))
  )
}
