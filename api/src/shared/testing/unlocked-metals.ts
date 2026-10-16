import query from '#shared/db/query.ts'

export async function ordersHoldingAnUnlockedMetal(): Promise<Set<string>> {
  const { rows } = await query<{ id: string }>(
    `SELECT DISTINCT o.id
       FROM orders.orders o
       JOIN orders.lots ol ON ol.order_id = o.id
       JOIN inventory.lots li ON li.id = ol.lot_id
       LEFT JOIN orders.spots os ON os.order_id = o.id AND os.metal_id = li.metal_id
      WHERE o.spots_locked
        AND (CASE WHEN o.direction = 'sale' THEN os.ask ELSE os.bid END) IS NULL`,
    []
  )
  return new Set(rows.map((row) => row.id))
}
