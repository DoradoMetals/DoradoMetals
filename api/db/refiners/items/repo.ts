import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import { columnsOf } from '#shared/db/columns.ts'
import { RefinerItem } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function getForItems(
  order_item_ids: string[],
  executor?: Executor
): Promise<RefinerItem[]> {
  if (order_item_ids.length === 0) return []
  const { rows } = await query<RefinerItem>(sql('get_for_items'), [order_item_ids], executor)
  return rows
}

export async function getForOrder(order_id: string, executor?: Executor): Promise<RefinerItem[]> {
  const { rows } = await query<RefinerItem>(sql('get_for_order'), [order_id], executor)
  return rows
}

export async function byOrderItem(
  order_item_ids: string[],
  executor?: Executor
): Promise<Map<string, RefinerItem>> {
  const rows = await getForItems(order_item_ids, executor)
  const out = new Map<string, RefinerItem>()
  for (const r of rows) if (!out.has(r.order_item_id)) out.set(r.order_item_id, r)
  return out
}

export type NewRefinerItem = Pick<
  RefinerItem,
  'order_item_id' | 'refiner_order_id' | 'bullion_id' | 'metal_id' | 'quantity'
>

export async function create(row: NewRefinerItem, executor?: Executor): Promise<RefinerItem> {
  const { rows } = await query<RefinerItem>(
    `INSERT INTO refiners.items
       (order_item_id, refiner_order_id, bullion_id, metal_id, quantity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, order_item_id, refiner_id, bullion_id, metal_id,
               pre_melt, post_melt, purity, content, premium, quantity, unit,
               refiner_order_id`,
    [row.order_item_id, row.refiner_order_id, row.bullion_id, row.metal_id, row.quantity],
    executor
  )
  return rows[0]
}

export async function mirrorForOrder(
  order_id: string,
  refiner_order_id: string,
  tx: Executor
): Promise<number> {
  const { rowCount } = await query(sql('mirror_for_order'), [order_id, refiner_order_id], tx)
  return rowCount ?? 0
}

const WRITABLE = RefinerItem.omit({
  id: true,
  order_item_id: true,
  refiner_order_id: true,
  refiner_id: true,
  bullion_id: true,
  metal_id: true,
  quantity: true,
})
export const PATCHABLE = columnsOf(WRITABLE)

export type ItemPatch = Partial<Pick<RefinerItem, (typeof PATCHABLE)[number]>>

export async function update(
  order_item_id: string,
  patch: ItemPatch,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: 'refiners.items',
    allowed: PATCHABLE,
    patch,
    where: { order_item_id },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}
