import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { SpotAdjustmentChangeRead } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function list(
  days: number,
  metal_id: string | null,
  executor?: Executor
): Promise<SpotAdjustmentChangeRead[]> {
  const { rows } = await query<SpotAdjustmentChangeRead>(sql('get_all'), [days, metal_id], executor)
  return rows
}
