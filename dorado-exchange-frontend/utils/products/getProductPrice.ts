import { SpotPrice } from '@/types/metal'
import { Product } from '@/features/products/types'

export default function getProductPrice(
  product: Product,
  spot?: SpotPrice
): number {
  if (!spot) return 0
  return product.content * ( spot.ask_spot * product.ask_premium)
}
