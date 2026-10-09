import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { SpotPatch, SpotPrice } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<SpotPrice[]> {
  const { rows } = await query<SpotPrice>(sql('get_all'), [], executor)
  return rows
}

export async function upsert(
  metal_id: string,
  patch: SpotPatch,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql('upsert'),
    [metal_id, patch.ask, patch.bid, patch.dollar_change, patch.percent_change],
    executor
  )
  return rowCount === 1
}
