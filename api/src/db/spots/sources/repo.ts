import query from '#shared/db/query.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { SpotSourcePatch, SpotSourceRead } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)
const VIEW = expression(sql('view'))
const LIST_SQL = sql('get_all').replace('/*__view__*/', VIEW)
const ONE_SQL = sql('get_one').replace('/*__view__*/', VIEW)

export async function list(executor?: Executor): Promise<SpotSourceRead[]> {
  const { rows } = await query<SpotSourceRead>(LIST_SQL, [], executor)
  return rows
}

export async function getOne(id: string, executor?: Executor): Promise<SpotSourceRead | undefined> {
  const { rows } = await query<SpotSourceRead>(ONE_SQL, [id], executor)
  return rows[0]
}

export async function update(
  id: string,
  patch: SpotSourcePatch,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql('update'), [id, patch.enabled, patch.sort_order], executor)
  return rowCount === 1
}

export async function makeDefault(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('make_default'), [id], executor)
  return (rowCount ?? 0) > 0
}

export async function stampAttempt(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('stamp_attempt'), [id], executor)
  return rowCount === 1
}

export async function stampTick(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('stamp_tick'), [id], executor)
  return rowCount === 1
}

export async function recordFailure(
  id: string,
  error: string,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql('record_failure'), [id, error], executor)
  return rowCount === 1
}
