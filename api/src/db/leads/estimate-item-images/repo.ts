import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { EstimateItemImage, EstimateItemImageLink } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function list(
  estimate_item_id: string,
  executor?: Executor
): Promise<EstimateItemImageLink[]> {
  const { rows } = await query(sql('list'), [estimate_item_id], executor)
  return rows.map((row) => EstimateItemImageLink.parse(row))
}

export async function create(
  estimate_item_id: string,
  image_id: string,
  executor?: Executor
): Promise<EstimateItemImage> {
  const { rows } = await query(sql('create'), [estimate_item_id, image_id], executor)
  return EstimateItemImage.parse(rows[0])
}

export async function remove(
  estimate_item_id: string,
  image_id: string,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql('remove'), [estimate_item_id, image_id], executor)
  return rowCount === 1
}
