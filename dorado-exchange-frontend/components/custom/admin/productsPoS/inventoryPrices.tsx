import { InventoryProduct } from '@/types/admin'
import { SpotPrice } from '@/types/metal'
import getProductPrice from '@/utils/getProductPrice'

export function getInventoryPriceTotals({
  product_list,
  spot,
}: {
  product_list: InventoryProduct[]
  spot: SpotPrice
}): number {
  if (!spot || !product_list?.length) return 0

  return product_list.reduce((sum, product) => {
    return sum + (product.quantity * (product.content * (spot.ask_spot * product.ask_premium)))
  }, 0)
}
