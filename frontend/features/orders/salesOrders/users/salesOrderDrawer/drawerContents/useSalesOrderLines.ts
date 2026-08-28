import { useOrderItems, byId } from '@/features/orders/reads'
import { useProducts } from '@/features/products/queries'
import type { SalesOrderLine } from './displayProducts'

// THE CONTAINER HALF of DisplaySalesOrderProducts (ruling 14). It sits next
// to what it renders, holds the order id, calls the two reads itself, and
// hands plain named lines down - one hop, not five.
//
// The catalogue lookup is the mapping ruling 12 requires: an orders.items row
// carries bullion_id, and the storefront's product list - already cached, and
// carrying mint_name because the CATALOGUE read joins it - supplies the rest.
export function useSalesOrderLines(order_id: string): SalesOrderLine[] {
  const { data: items = [] } = useOrderItems(order_id)
  const { data: catalogue = [] } = useProducts()

  return items.map((item) => {
    const product = byId(catalogue, item.bullion_id)
    return {
      id: item.id,
      name: product?.name ?? null,
      mint_name: product?.mint_name ?? null,
      image_front: product?.image_front ?? null,
      quantity: item.quantity,
      price: item.price,
    }
  })
}
