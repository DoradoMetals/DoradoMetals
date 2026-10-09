import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { SpotLockAction } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function record(
  order_id: string,
  action: SpotLockAction,
  executor?: Executor
): Promise<number> {
  const { rowCount } = await query(sql('record'), [order_id, action], executor)
  return rowCount ?? 0
}
