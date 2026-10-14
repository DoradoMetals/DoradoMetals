import path from 'node:path'
import query from '#shared/db/query.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import {
  MetalSpot,
  SpotBoard,
  type SpotActivity,
  type SpotPatch,
  type SpotPrice,
} from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)
const adjustmentsSql = sqlFrom(path.join(import.meta.dirname, 'adjustments'))
const ordersSql = sqlFrom(path.join(import.meta.dirname, '..', 'orders'))

const METAL_SQL = sql('metal').replace('/*__adjustments__*/', expression(adjustmentsSql('view')))
const ACTIVITY_SQL = sql('activity').replace(
  '/*__order_reference__*/',
  expression(ordersSql('order_reference'))
)

export async function list(executor?: Executor): Promise<SpotPrice[]> {
  const { rows } = await query<SpotPrice>(sql('get_all'), [], executor)
  return rows
}

export async function board(executor?: Executor): Promise<SpotBoard> {
  const { rows } = await query<{ board: unknown }>(sql('board'), [], executor)
  return SpotBoard.parse(rows[0]?.board)
}

export async function metal(metal_id: string, executor?: Executor): Promise<MetalSpot | undefined> {
  const { rows } = await query<{ metal: unknown }>(METAL_SQL, [metal_id], executor)
  return rows[0] ? MetalSpot.parse(rows[0].metal) : undefined
}

export async function activity(
  metal_id: string,
  days: number,
  executor?: Executor
): Promise<SpotActivity[]> {
  const { rows } = await query<SpotActivity>(ACTIVITY_SQL, [metal_id, days], executor)
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
