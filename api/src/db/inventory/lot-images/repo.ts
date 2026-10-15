import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { LotImage, LotImageLink } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function list(lot_id: string, executor?: Executor): Promise<LotImageLink[]> {
  const { rows } = await query(sql('list'), [lot_id], executor)
  return rows.map((row) => LotImageLink.parse(row))
}

export async function create(
  lot_id: string,
  image_id: string,
  executor?: Executor
): Promise<LotImage> {
  const { rows } = await query(sql('create'), [lot_id, image_id], executor)
  return LotImage.parse(rows[0])
}

export async function cover(
  lot_id: string,
  image_id: string,
  executor?: Executor
): Promise<LotImage> {
  const { rows } = await query(sql('cover'), [lot_id, image_id], executor)
  return LotImage.parse(rows[0])
}

export async function remove(
  lot_id: string,
  image_id: string,
  executor?: Executor
): Promise<boolean> {
  const { rowCount } = await query(sql('remove'), [lot_id, image_id], executor)
  return rowCount === 1
}
