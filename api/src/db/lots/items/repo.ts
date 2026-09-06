import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf, returningOf } from '#shared/db/columns.ts'
import { Lot, LotPatch } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(LotPatch)
const RETURNING = returningOf(Lot)

export async function getOne(id: string, executor?: Executor): Promise<Lot | undefined> {
  const { rows } = await query<Lot>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getByIds(ids: string[], executor?: Executor): Promise<Lot[]> {
  if (ids.length === 0) return []
  const { rows } = await query<Lot>(sql('get_by_ids'), [ids], executor)
  return rows
}

export async function create(row: LotPatch, executor?: Executor): Promise<Lot> {
  const { rows } = await query<Lot>(
    sql('create'),
    [
      row.metal_id ?? null,
      row.unit ?? null,
      row.quantity ?? null,
      row.pre_melt ?? null,
      row.post_melt ?? null,
      row.purity ?? null,
      row.image_id ?? null,
    ],
    executor
  )
  return rows[0]
}

export async function createFromProduct(
  bullion_id: string,
  quantity: number | null,
  buying = false,
  executor?: Executor
): Promise<Lot | undefined> {
  const { rows } = await query<Lot>(
    sql('create_from_product'),
    [bullion_id, quantity, buying],
    executor
  )
  return rows[0]
}

export async function splitOff(
  parent_id: string,
  parts: LotPatch[],
  executor?: Executor
): Promise<Lot[]> {
  if (parts.length === 0) return []
  const { rows } = await query<Lot>(
    sql('split'),
    [
      parent_id,
      parts.map((p) => p.pre_melt ?? null),
      parts.map((p) => p.post_melt ?? null),
      parts.map((p) => p.purity ?? null),
      parts.map((p) => p.unit ?? null),
      parts.map((p) => p.quantity ?? null),
    ],
    executor
  )
  return rows
}

export async function update(
  id: string,
  patch: LotPatch,
  executor?: Executor
): Promise<Lot | undefined> {
  const built = buildUpdate({
    table: 'lots.items',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning: RETURNING,
  })
  if (!built) return await getOne(id, executor)
  const { rows } = await query<Lot>(built.text, built.values, executor)
  return rows[0]
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}
