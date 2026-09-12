import path from 'node:path'
import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { SpotLock } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

const ORDERS_SQL = sqlFrom(path.join(import.meta.dirname, '..', '..', 'orders'))
const ORDER_REFERENCE = ORDERS_SQL('order_reference').trim()

const LIST_SQL = sql('get_all').replace('/*__order_reference__*/', ORDER_REFERENCE)

export async function list(executor?: Executor): Promise<SpotLock[]> {
  const { rows } = await query<SpotLock>(LIST_SQL, [], executor)
  return rows
}
