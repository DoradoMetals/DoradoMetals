import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { LotUnlink, LotUnlinkNew } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function create(row: LotUnlinkNew, executor?: Executor): Promise<LotUnlink> {
  const { rows } = await query<LotUnlink>(
    sql('create'),
    [row.order_id, row.lot_id, row.reason],
    executor
  )
  return rows[0]!
}

export async function forOrder(order_id: string, executor?: Executor): Promise<LotUnlink[]> {
  const { rows } = await query<LotUnlink>(sql('for_order'), [order_id], executor)
  return rows
}
