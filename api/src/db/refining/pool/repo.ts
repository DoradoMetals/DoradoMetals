import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { PoolBalance, PoolEntry, PoolLockCreate } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function balances(
  refiner_id: string | null,
  metal_id: string | null,
  executor?: Executor
): Promise<PoolBalance[]> {
  const { rows } = await query<{ row: unknown }>(sql('balances'), [refiner_id, metal_id], executor)
  return rows.map((r) => PoolBalance.parse(r.row))
}

export async function entries(
  refiner_id: string | null,
  metal_id: string | null,
  executor?: Executor
): Promise<PoolEntry[]> {
  const { rows } = await query<PoolEntry>(sql('entries'), [refiner_id, metal_id], executor)
  return rows
}

export async function lock(row: PoolLockCreate, executor?: Executor): Promise<PoolEntry> {
  const { rows } = await query<PoolEntry>(
    sql('lock'),
    [row.refiner_id, row.metal_id, row.troy_oz, row.lock_price, row.refining_order_id],
    executor
  )
  return rows[0]
}

export async function credit(
  refining_order_id: string,
  executor?: Executor
): Promise<PoolEntry[]> {
  const { rows } = await query<PoolEntry>(sql('credit'), [refining_order_id], executor)
  return rows
}
