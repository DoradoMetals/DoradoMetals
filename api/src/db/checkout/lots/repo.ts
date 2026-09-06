import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { CheckoutLot, Lot } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function listFor(checkout_id: string, executor?: Executor): Promise<Lot[]> {
  const { rows } = await query<Lot>(sql('list_for_checkout'), [checkout_id], executor)
  return rows
}

export async function link(
  checkout_id: string,
  lot_id: string,
  executor?: Executor
): Promise<CheckoutLot> {
  const { rows } = await query<CheckoutLot>(sql('create'), [checkout_id, lot_id], executor)
  return rows[0]
}

export async function remove(lot_id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [lot_id], executor)
  return rowCount === 1
}

export async function removeFor(checkout_id: string, executor?: Executor): Promise<number> {
  const { rowCount } = await query(sql('delete_for_checkout'), [checkout_id], executor)
  return rowCount ?? 0
}

export async function reassign(
  from_checkout_id: string,
  to_checkout_id: string,
  executor?: Executor
): Promise<number> {
  const { rowCount } = await query(sql('reassign'), [from_checkout_id, to_checkout_id], executor)
  return rowCount ?? 0
}
