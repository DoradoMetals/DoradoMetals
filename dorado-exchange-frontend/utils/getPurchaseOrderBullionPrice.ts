import { SpotPrice } from '@/types/metal'
import { Product } from '@/types/product'

export default function getPurchaseOrderBullionPrice(
  item: Product,
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[]
): number {
  const orderSpot = orderSpotPrices?.find((s) => s.type === item.metal_type)
  const globalSpot = spotPrices?.find((s) => s.type === item.metal_type)
  const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0

  const price = item.price ?? (item?.content ?? 0) * (bid_spot * (item?.bid_premium ?? 0))

  return price
}
