import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import {
  RateChangePage,
  type AdminRate,
  type RateBandInput,
  type RateChangeFilter,
  type RateRead,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getOne(id: string, executor?: Executor): Promise<AdminRate | undefined> {
  const { rows } = await query<AdminRate>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function list(executor?: Executor): Promise<RateRead[]> {
  const { rows } = await query<RateRead>(sql('get_all'), [], executor)
  return rows
}

export async function listAdmin(executor?: Executor): Promise<AdminRate[]> {
  const { rows } = await query<AdminRate>(sql('get_admin_all'), [], executor)
  return rows
}

export async function replaceBands(
  metal_id: string,
  bands: RateBandInput[],
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql('replace_bands'),
    [metal_id, JSON.stringify(bands)],
    executor
  )
  return rowCount === 1
}

export async function changes(
  filter: RateChangeFilter,
  executor?: Executor
): Promise<RateChangePage> {
  const { rows } = await query<{ page: unknown }>(
    sql('changes'),
    [filter.q ?? null, filter.page],
    executor
  )
  return RateChangePage.parse(rows[0]?.page)
}
