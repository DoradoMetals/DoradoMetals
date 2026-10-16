import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { PurityDispute, PurityDisputeNew } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function create(row: PurityDisputeNew, executor?: Executor): Promise<PurityDispute> {
  const { rows } = await query<PurityDispute>(
    sql('create'),
    [row.order_id, row.lot_id, row.our_purity, row.claimed_purity, row.claim_source, row.reason],
    executor
  )
  return rows[0]!
}

export async function getOne(id: string, executor?: Executor): Promise<PurityDispute | undefined> {
  const { rows } = await query<PurityDispute>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function forOrder(order_id: string, executor?: Executor): Promise<PurityDispute[]> {
  const { rows } = await query<PurityDispute>(sql('for_order'), [order_id], executor)
  return rows
}

export async function openForLot(
  lot_id: string,
  executor?: Executor
): Promise<PurityDispute | undefined> {
  const { rows } = await query<PurityDispute>(sql('open_for_lot'), [lot_id], executor)
  return rows[0]
}

export async function resolve(
  id: string,
  resolution: string,
  executor?: Executor
): Promise<PurityDispute | undefined> {
  const { rows } = await query<PurityDispute>(sql('resolve'), [id, resolution], executor)
  return rows[0]
}
