import { SpotPrice } from '@/features/spots/types'
import { Product } from '@/features/products/types'

export default function getPurchaseOrderBullionPrice(
  item: Product,
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[],
  premium: number | null,
): number {
  const orderSpot = orderSpotPrices?.find((s) => s.type === item.metal_type)
  const globalSpot = spotPrices?.find((s) => s.type === item.metal_type)
  const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0

  const price = item.price ?? ((item?.content ?? 0) * (bid_spot * (premium ?? item?.bid_premium ?? 0)))

  return price
}
