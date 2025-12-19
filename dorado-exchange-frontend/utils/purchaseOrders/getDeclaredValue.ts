import { PurchaseOrder } from '@/types/purchase-order'
import { SpotPrice } from '@/types/metal'
import { SellCartItem } from '@/types/sellCart'
import getProductBidPrice from './getProductBidPrice'
import getScrapPrice from './purchaseOrders/getScrapPrice'

export function getReturnDeclaredValue(
  order: PurchaseOrder,
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[]
): number {
  const total = order.order_items.reduce((acc, item) => {
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

      const price = item.price ?? (item?.scrap?.content ?? 0) * (bid_spot * (item.premium ?? item?.scrap?.bid_premium ?? 1))
      return acc + price
    }

    return acc
  }, 0)

  return Math.min(total, 50000)
}

export function getDeclaredValue(items: SellCartItem[], spotPrices: SpotPrice[]): number {
     const total = items.reduce((acc, item) => {
       if (item.type === 'product') {
         const spot = spotPrices.find((s) => s.type === item.data.metal_type)
         const price = getProductBidPrice(item.data, spot)
         const quantity = item.data.quantity ?? 1
         return acc + price * quantity
       }
       if (item.type === 'scrap') {
         const spot = spotPrices.find((s) => s.type === item.data.metal)
         const price = getScrapPrice(item.data.content ?? 0, item.data.bid_premium ?? 1, spot)
         return acc + price
       }
       return acc
     }, 0)

  return Math.min(total, 50000)
}
