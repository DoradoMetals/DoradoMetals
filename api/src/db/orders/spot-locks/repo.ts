import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { OrderSpotLockEvent, SpotLockAction } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function record(
  order_id: string,
  action: SpotLockAction,
  executor?: Executor,
  reason: string | null = null
): Promise<number> {
  const { rowCount } = await query(sql('record'), [order_id, action, reason], executor)
  return rowCount ?? 0
}

export async function forOrder(
  order_id: string,
  executor?: Executor
): Promise<OrderSpotLockEvent[]> {
  const { rows } = await query<OrderSpotLockEvent>(sql('for_order'), [order_id], executor)
  return rows
}
