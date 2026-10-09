import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf, returningOf } from '#shared/db/columns.ts'
import { EstimateItem, EstimateItemPatch } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(EstimateItemPatch)

const RETURNING = returningOf(EstimateItem)

export async function getOne(
  lead_id: string,
  id: string,
  executor?: Executor
): Promise<EstimateItem | undefined> {
  const { rows } = await query<EstimateItem>(sql('get_one'), [lead_id, id], executor)
  return rows[0]
}

export async function forLead(lead_id: string, executor?: Executor): Promise<EstimateItem[]> {
  const { rows } = await query<EstimateItem>(sql('get_all'), [lead_id], executor)
  return rows
}

export async function create(
  lead_id: string,
  row: EstimateItemPatch,
  executor?: Executor
): Promise<EstimateItem> {
  const { rows } = await query<EstimateItem>(
    sql('create'),
    [
      lead_id,
      row.kind_id,
      row.metal_id,
      row.weight,
      row.unit_id,
      row.purity_id ?? null,
      row.custom_purity ?? null,
    ],
    executor
  )
  return rows[0]!
}

export async function update(
  lead_id: string,
  id: string,
  patch: EstimateItemPatch,
  executor?: Executor
): Promise<EstimateItem | undefined> {
  const built = buildUpdate({
    table: 'leads.estimate_items',
    allowed: PATCHABLE,
    patch,
    where: { id, lead_id },
    returning: RETURNING,
  })
  if (!built) return await getOne(lead_id, id, executor)
  const { rows } = await query<EstimateItem>(built.text, built.values, executor)
  return rows[0]
}

export async function remove(lead_id: string, id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [lead_id, id], executor)
  return rowCount === 1
}
