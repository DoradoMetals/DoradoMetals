import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf } from '#shared/db/columns.ts'
import type { Executor } from '#shared/db/executor.ts'
import { SpotSourcePatch, type SpotSourceRead } from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(SpotSourcePatch)

export async function list(executor?: Executor): Promise<SpotSourceRead[]> {
  const { rows } = await query<SpotSourceRead>(sql('get_all'), [], executor)
  return rows
}

export async function getOne(id: string, executor?: Executor): Promise<SpotSourceRead | undefined> {
  const { rows } = await query<SpotSourceRead>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function update(
  id: string,
  patch: SpotSourcePatch,
  executor?: Executor
): Promise<boolean> {
  const built = buildUpdate({ table: 'spots.sources', allowed: PATCHABLE, patch, where: { id } })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function stampAttempt(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('stamp_attempt'), [id], executor)
  return rowCount === 1
}

export async function stampTick(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('stamp_tick'), [id], executor)
  return rowCount === 1
}
