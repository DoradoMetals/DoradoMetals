import { SpotPrice } from '@/lib/queries/useSpotPrices'
import { Product } from '@/types'

export default function getProductPrice(
  product: Product,
  spot?: SpotPrice
): number {
  if (!spot) return 0
  return product.content * spot.bid_spot
}
