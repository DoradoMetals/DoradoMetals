import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { ActiveSpotSource } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<ActiveSpotSource[]> {
  const { rows } = await query<ActiveSpotSource>(sql('get_all'), [], executor)
  return rows
}

export async function getOne(
  metal_id: string,
  executor?: Executor
): Promise<ActiveSpotSource | undefined> {
  const { rows } = await query<ActiveSpotSource>(sql('get_one'), [metal_id], executor)
  return rows[0]
}

export async function set(
  metal_id: string,
  source_id: string,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql('set'), [metal_id, source_id], executor)
  return rowCount === 1
}
