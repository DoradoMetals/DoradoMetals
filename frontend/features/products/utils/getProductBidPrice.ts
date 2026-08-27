import { SpotPrice } from '@/features/spots/types'
import { Product } from '@/features/products/types'

export default function getProductBidPrice(
  product?: Product,
  spot?: SpotPrice
): number {
  if (!spot || !product) return 0
  return product.content * ((spot.bid ?? 0) * product.bid_premium);
}