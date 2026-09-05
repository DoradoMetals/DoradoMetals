import type { OrderView } from '@dorado/contracts'
import { useProducts } from '@/features/products/queries'
import { byId } from '@/features/orders/display'
import type { SalesOrderLine } from './displayProducts'

// THE CONTAINER HALF of DisplaySalesOrderProducts (ruling 14), over the view.
//
// It called two reads of its own - the order's lines and the catalogue - and
// multiplied a price by a quantity at every call site that used it. The lines
// come with the view now, each carrying the catalogue row behind it
// (`item.product`) and its own `line_total`, so nothing here computes money.
//
// The name is the view's own (`product_name` for a catalogue line,
// `item_name` for a scrap lot); the mint and the picture are the mapping
// ruling 12 asks the client to do against a catalogue it already caches.
export function useSalesOrderLines(view: OrderView): SalesOrderLine[] {
  const { data: catalogue = [] } = useProducts()

  return view.items.map((item) => ({
    id: item.id,
    name: item.product_name ?? item.item_name,
    mint_name: byId(catalogue, item.bullion_id)?.mint_name ?? null,
    image_front: byId(catalogue, item.bullion_id)?.image_front ?? null,
    quantity: item.quantity,
    price: item.price,
    line_total: item.line_total,
  }))
}
