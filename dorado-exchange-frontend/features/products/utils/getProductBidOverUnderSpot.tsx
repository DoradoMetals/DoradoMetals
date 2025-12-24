import { Product } from '@/features/products/types'
import { SpotPrice } from '@/features/spots/types'

export default function getProductBidOverUnderSpot(product?: Product, spot?: SpotPrice): number {
  if (!product || !spot) return 0

  return product.content * spot.bid_spot * (product.bid_premium - 1)
}