import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { LotSource } from '@dorado/contracts'
import type { LotSourceKind } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export async function getFor(lot_id: string, executor?: Executor): Promise<LotSource[]> {
  const { rows } = await query<LotSource>(sql('get_for'), [lot_id], executor)
  return rows
}

export async function sourcesOf(lot_ids: string[], executor?: Executor): Promise<LotSource[]> {
  if (lot_ids.length === 0) return []
  const { rows } = await query<LotSource>(sql('sources_of'), [lot_ids], executor)
  return rows
}

export async function link(
  lot_id: string,
  source_lot_id: string,
  kind: LotSourceKind,
  executor?: Executor
): Promise<LotSource> {
  const { rows } = await query<LotSource>(sql('link'), [lot_id, source_lot_id, kind], executor)
  return rows[0]
}

export async function linkMany(
  lot_ids: string[],
  source_lot_ids: string[],
  kinds: LotSourceKind[],
  executor?: Executor
): Promise<LotSource[]> {
  if (lot_ids.length === 0) return []
  const { rows } = await query<LotSource>(
    sql('link_many'),
    [lot_ids, source_lot_ids, kinds],
    executor
  )
  return rows
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('remove'), [id], executor)
  return rowCount === 1
}

export async function repoint(
  lot_id: string,
  source_lot_id: string,
  kind: LotSourceKind,
  executor?: Executor
): Promise<LotSource> {
  const { rows } = await query<LotSource>(
    sql('repoint'),
    [lot_id, source_lot_id, kind],
    executor
  )
  return rows[0]
}
