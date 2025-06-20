import { AdminProductsInventory, InventoryProduct } from '@/types/admin'
import { SpotPrice } from '@/types/metal'

export function getInventoryPriceTotals({
  product_list,
  spot,
}: {
  product_list: InventoryProduct[]
  spot: SpotPrice
}): number {
  if (!spot || !product_list?.length) return 0

  return product_list.reduce((sum, product) => {
    return sum + product.quantity * (product.content * (spot.ask_spot * product.ask_premium))
  }, 0)
}

export function getInventoryValue({
  productInventory,
  spots,
}: {
  productInventory: AdminProductsInventory
  spots: SpotPrice[]
}): number {
  if (!productInventory || !spots.length) return 0

  return (Object.keys(productInventory) as Array<keyof AdminProductsInventory>).reduce(
    (total, metalKey) => {
      const group = productInventory[metalKey]
      const spot = spots.find((s) => s.type === metalKey)
      if (!spot) return total
      return (
        total +
        getInventoryPriceTotals({
          product_list: group.inventory_list,
          spot,
        })
      )
    },
    0
  )
}
