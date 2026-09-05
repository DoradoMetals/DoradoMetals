import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { RefinerOrder } from '@dorado/contracts'
import { columnsOf } from '#shared/db/columns.ts'
import { RefinerOrderPatch, RefinerOrderView } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export type NewRefinerOrder = Pick<RefinerOrder, 'order_id'>

export async function create(row: NewRefinerOrder, executor?: Executor): Promise<RefinerOrder> {
  const { rows } = await query<RefinerOrder>(
    `INSERT INTO refiners.orders (order_id) VALUES ($1)
     RETURNING id, order_id, refiner_id, pool_oz_deducted, pool_remediation, fee,
               created_at, updated_at`,
    [row.order_id],
    executor
  )
  return rows[0]
}

export async function findByOrder(
  order_id: string,
  executor?: Executor
): Promise<RefinerOrder | undefined> {
  const { rows } = await query<RefinerOrder>(
    `SELECT id, order_id, refiner_id, pool_oz_deducted, pool_remediation, fee,
            created_at, updated_at
       FROM refiners.orders
      WHERE order_id = $1`,
    [order_id],
    executor
  )
  return rows[0]
}

export async function findById(id: string, executor?: Executor): Promise<RefinerOrder | undefined> {
  const { rows } = await query<RefinerOrder>(
    `SELECT id, order_id, refiner_id, pool_oz_deducted, pool_remediation, fee,
            created_at, updated_at
       FROM refiners.orders
      WHERE id = $1`,
    [id],
    executor
  )
  return rows[0]
}

export type OrderPatch = Partial<
  Pick<RefinerOrder, 'pool_oz_deducted' | 'pool_remediation' | 'fee'>
> & {
  refiner_id?: string | null
}

export const PATCHABLE = columnsOf(RefinerOrderPatch.omit({ spots: true }))

export async function update(id: string, patch: OrderPatch, executor?: Executor): Promise<boolean> {
  const built = buildUpdate({
    table: 'refiners.orders',
    allowed: PATCHABLE,
    patch,
    where: { id },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function viewForOrder(
  order_id: string,
  executor?: Executor
): Promise<RefinerOrderView | undefined> {
  const { rows } = await query<{ view: unknown }>(sql('view_for_order'), [order_id], executor)
  return rows[0] === undefined ? undefined : RefinerOrderView.parse(rows[0].view)
}
