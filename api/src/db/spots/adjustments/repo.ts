import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf } from '#shared/db/columns.ts'
import type { Executor } from '#shared/db/executor.ts'
import { SpotAdjustmentPatch, type SpotAdjustmentRead } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(SpotAdjustmentPatch)

export async function list(executor?: Executor): Promise<SpotAdjustmentRead[]> {
  const { rows } = await query<SpotAdjustmentRead>(sql('get_all'), [], executor)
  return rows
}

export async function getOne(
  metal_id: string,
  source_id: string,
  executor?: Executor
): Promise<SpotAdjustmentRead | undefined> {
  const { rows } = await query<SpotAdjustmentRead>(sql('get_one'), [metal_id, source_id], executor)
  return rows[0]
}

export async function create(
  metal_id: string,
  source_id: string,
  patch: SpotAdjustmentPatch,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(
    sql('create'),
    [
      metal_id,
      source_id,
      patch.bid_amount,
      patch.ask_amount,
      patch.unit,
      patch.reason,
      patch.expires_at,
      patch.expires_at_market_open,
      patch.enabled,
    ],
    executor
  )
  return rowCount === 1
}

export async function update(
  metal_id: string,
  source_id: string,
  patch: SpotAdjustmentPatch,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({
    table: 'spots.adjustments',
    allowed: PATCHABLE,
    patch,
    where: { metal_id, source_id },
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function remove(
  metal_id: string,
  source_id: string,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [metal_id, source_id], executor)
  return rowCount === 1
}
