import path from 'node:path'
import query from '#shared/db/query.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import { SpotLockPage, type SpotLock, type SpotLockFilter } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)
const ordersSql = sqlFrom(path.join(import.meta.dirname, '..', '..', 'orders'))

const VIEW = expression(sql('view')).replace(
  '/*__order_reference__*/',
  expression(ordersSql('order_reference'))
)
const PAGE_SQL = sql('page').replace('/*__view__*/', VIEW)
const ONE_SQL = sql('get_one').replace('/*__view__*/', VIEW)

export async function page(filter: SpotLockFilter, executor?: Executor): Promise<SpotLockPage> {
  const { rows } = await query<{ page: unknown }>(
    PAGE_SQL,
    [filter.metal ?? null, filter.status ?? null, filter.q ?? null, filter.page],
    executor
  )
  return SpotLockPage.parse(rows[0]?.page)
}

export async function getOne(id: string, executor?: Executor): Promise<SpotLock | undefined> {
  const { rows } = await query<SpotLock>(ONE_SQL, [id], executor)
  return rows[0]
}
