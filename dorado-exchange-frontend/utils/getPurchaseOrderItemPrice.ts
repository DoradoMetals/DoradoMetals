import { SpotPrice } from '@/types/metal'
import { PurchaseOrderItem } from '@/types/purchase-order'
import { Scrap } from '@/types/scrap'

export default function getPurchaseOrderItemPrice(
  item: PurchaseOrderItem,
  spots: SpotPrice[]
): number {
  if (item.item_type === 'product') {
    const spot = spots.find((s) => s.type === item.product?.metal_type)!
    return (
      (item?.product?.content ?? 0) *
      (spot.bid_spot * (item.premium ?? item?.product?.bid_premium ?? 0))
    )
  } else if (item.item_type === 'scrap') {
    const spot = spots.find((s) => s.type === item.scrap?.metal)!
    return (item?.scrap?.content ?? 0) * (spot.bid_spot * spot.scrap_percentage)
  } else {
    return 0
  }
}
