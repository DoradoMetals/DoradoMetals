import { SpotPrice } from '@/features/spots/types'
import { Product } from '@/features/products/types'

export default function getProductPrice(
  product: Product,
  spot?: SpotPrice
): number {
  if (!spot) return 0
  return product.content * ((spot.ask ?? 0) * product.ask_premium)
}
