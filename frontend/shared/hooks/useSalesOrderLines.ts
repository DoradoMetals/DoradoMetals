import type { OrderView } from '@dorado/contracts'
import { useProducts } from '@/shared/hooks/products/queries'
import { byId } from '@/shared/utils/byId'
import type { SalesOrderLine } from '@/shared/ui/displayProducts'

// THE CONTAINER HALF of DisplaySalesOrderProducts (ruling 14), over the view.
//
// It called two reads of its own - the order's lines and the catalogue - and
// multiplied a price by a quantity at every call site that used it. The lines
// come with the view now, each carrying its own `line_total`, so nothing here
// computes money.
//
// A LINE IS A LOT (docs/waves/lots-build.md): `OrderView.items` is
// `OrderView.lots`, and every physical fact - the product name, the quantity -
// reads off `row.lot`, which the view derives. The mint and the picture are the
// mapping ruling 12 asks the client to do against a catalogue it already caches.
export function useSalesOrderLines(view: OrderView): SalesOrderLine[] {
  const { data: catalogue = [] } = useProducts()

  return view.lots.map((row) => ({
    id: row.id,
    name: row.lot.product_name ?? row.lot.form ?? row.lot.metal_id,
    mint_name: byId(catalogue, row.lot.bullion_id)?.mint_name ?? null,
    image_front: byId(catalogue, row.lot.bullion_id)?.image_front ?? null,
    quantity: row.lot.quantity,
    price: row.price,
    line_total: row.line_total,
  }))
}
