import { Product } from '@/types/product'
import { SpotPrice } from '@/types/metal'

export default function getProductAskOverUnderSpot(product?: Product, spot?: SpotPrice): number {
  if (!product || !spot) return 0

  return product.content * spot.ask_spot * (product.ask_premium - 1)
}