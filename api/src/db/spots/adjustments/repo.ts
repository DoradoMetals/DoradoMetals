import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import { columnsOf } from '#shared/db/columns.ts'
import type { Executor } from '#shared/db/executor.ts'
import {
  SpotAdjustmentPatch,
  type SpotAdjustmentRead,
  type SpotAdjustmentStatus,
} from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)
const VIEW = expression(sql('view'))
const LIST_SQL = sql('get_all').replace('/*__view__*/', VIEW)
const ONE_SQL = sql('get_one').replace('/*__view__*/', VIEW)

export const PATCHABLE = columnsOf(SpotAdjustmentPatch)

export async function list(
  status: SpotAdjustmentStatus,
  executor?: Executor
): Promise<SpotAdjustmentRead[]> {
  const { rows } = await query<SpotAdjustmentRead>(LIST_SQL, [status], executor)
  return rows
}

export async function getOne(
  metal_id: string,
  source_id: string,
  executor?: Executor
): Promise<SpotAdjustmentRead | undefined> {
  const { rows } = await query<SpotAdjustmentRead>(ONE_SQL, [metal_id, source_id], executor)
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
      patch.mode,
      patch.bid_amount,
      patch.ask_amount,
      patch.unit,
      patch.frozen_bid,
      patch.frozen_ask,
      patch.reason,
      patch.expires_at,
      patch.expires_at_market_open,
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

export async function cancel(metal_id: string, executor?: Executor): Promise<number> {
  const { rowCount } = await query(sql('cancel'), [metal_id], executor)
  return rowCount ?? 0
}

export async function freezeAll(reason: string, executor?: Executor): Promise<number> {
  const { rowCount } = await query(sql('freeze_all'), [reason], executor)
  return rowCount ?? 0
}
