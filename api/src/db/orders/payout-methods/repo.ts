import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { PayoutMethodLine, PayoutMethodSplit, PayoutShares } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function forOrder(
  order_id: string,
  executor?: Executor
): Promise<PayoutMethodSplit[]> {
  const { rows } = await query<PayoutMethodSplit>(sql('for_order'), [order_id], executor)
  return rows
}

export async function create(
  order_id: string,
  row: PayoutMethodLine,
  executor?: Executor
): Promise<PayoutMethodSplit> {
  const { rows } = await query<PayoutMethodSplit>(
    sql('create'),
    [order_id, row.method_id, row.amount],
    executor
  )
  return rows[0]!
}

export async function removeFor(order_id: string, executor?: Executor): Promise<number> {
  const { rowCount } = await query(sql('delete_for_order'), [order_id], executor)
  return rowCount ?? 0
}

export async function shares(order_id: string, executor?: Executor): Promise<PayoutShares> {
  const { rows } = await query<PayoutShares>(sql('shares'), [order_id], executor)
  return rows[0] ?? { account: null, transfer: null, split: false }
}
