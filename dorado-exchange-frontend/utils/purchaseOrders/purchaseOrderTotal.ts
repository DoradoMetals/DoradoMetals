import { PurchaseOrder } from '@/types/purchase-order'
import { SpotPrice } from '@/features/spots/types'

export default function getPurchaseOrderTotal(
  order: PurchaseOrder,
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[],
): number {
  const baseTotal = order.order_items.reduce((acc, item) => {
    if (item.item_type === 'product') {
      const orderSpot = orderSpotPrices?.find((s) => s.type === item.product?.metal_type)
      const globalSpot = spotPrices?.find((s) => s.type === item.product?.metal_type)
      const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0

      const price =
        item.price ??
        (item?.product?.content ?? 0) *
          (bid_spot * (item.premium ?? item?.product?.bid_premium ?? 0))

      const quantity = item.quantity ?? 1
      return acc + price * quantity
    }

    if (item.item_type === 'scrap') {
      const orderSpot = orderSpotPrices?.find((s) => s.type === item.scrap?.metal)
      const globalSpot = spotPrices.find((s) => s.type === item.scrap?.metal)

      const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0

      const price = item.price ?? (item?.scrap?.content ?? 0) * (bid_spot * (item.premium ?? 1))
      return acc + price
    }

    return acc
  }, 0)

  const shipping = order.shipment?.shipping_charge ?? 0
  return baseTotal - shipping - order.payout.cost
}
