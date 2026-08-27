import { SpotPrice } from '@/features/spots/types'
import { Product } from '@/features/products/types'

export default function getPurchaseOrderBullionPrice(
  item: Product,
  spotPrices: SpotPrice[],
  orderSpotPrices: SpotPrice[],
  premium: number | null,
): number {
  const orderSpot = orderSpotPrices?.find((s) => s.name === item.metal_type)
  const globalSpot = spotPrices?.find((s) => s.name === item.metal_type)
  const bidSpot = orderSpot?.bid ?? globalSpot?.bid ?? 0

  const price = item.price ?? ((item?.content ?? 0) * (bidSpot * (premium ?? item?.bid_premium ?? 0)))

  return price
}
