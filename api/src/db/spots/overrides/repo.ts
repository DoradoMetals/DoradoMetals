import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { SpotOverridePatch, SpotOverrideRead } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export async function list(executor?: Executor): Promise<SpotOverrideRead[]> {
  const { rows } = await query<SpotOverrideRead>(sql('list'), [], executor)
  return rows
}

export async function activeMetalIds(executor?: Executor): Promise<string[]> {
  const { rows } = await query<{ metal_id: string }>(sql('active_metal_ids'), [], executor)
  return rows.map((row) => row.metal_id)
}

export async function set(
  metal_id: string,
  patch: SpotOverridePatch,
  executor?: Executor
): Promise<SpotOverrideRead> {
  const { rows } = await query<SpotOverrideRead>(
    sql('set'),
    [metal_id, patch.bid, patch.ask, patch.reason, patch.expires_at ?? null],
    executor
  )
  return rows[0]
}

export async function remove(metal_id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [metal_id], executor)
  return rowCount === 1
}
