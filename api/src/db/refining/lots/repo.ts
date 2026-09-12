import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf, returningOf } from '#shared/db/columns.ts'
import * as inventoryLots from '#db/inventory/lots/repo.ts'
import { Lot, RefiningLot, RefiningLotPatch } from '@dorado/contracts'
import type { RefiningSettlementLot } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(RefiningLotPatch)
const LOT_RETURNING = returningOf(Lot)

export async function getOne(id: string, executor?: Executor): Promise<RefiningLot | undefined> {
  const { rows } = await query<RefiningLot>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getFor(
  refining_order_id: string,
  executor?: Executor
): Promise<RefiningLot[]> {
  const { rows } = await query<RefiningLot>(sql('get_for'), [refining_order_id], executor)
  return rows
}

export async function getByLots(lot_ids: string[], executor?: Executor): Promise<RefiningLot[]> {
  if (lot_ids.length === 0) return []
  const { rows } = await query<RefiningLot>(sql('get_by_lots'), [lot_ids], executor)
  return rows
}

export async function alreadyBatched(lot_ids: string[], executor?: Executor): Promise<string[]> {
  if (lot_ids.length === 0) return []
  const { rows } = await query<{ source_lot_id: string }>(
    sql('already_batched'),
    [lot_ids],
    executor
  )
  return rows.map((row) => row.source_lot_id)
}

export async function assign(
  refining_order_id: string,
  lot_ids: string[],
  executor?: Executor
): Promise<RefiningLot[]> {
  if (lot_ids.length === 0) return []
  const { rows } = await query<RefiningLot>(
    sql('assign'),
    [refining_order_id, lot_ids],
    executor
  )
  return rows
}

export async function update(
  id: string,
  patch: RefiningLotPatch,
  executor?: Executor
): Promise<Lot | undefined> {
  const link = await getOne(id, executor)
  if (!link) return undefined
  const built = buildUpdate({
    table: 'inventory.lots',
    allowed: PATCHABLE,
    patch,
    where: { id: link.lot_id },
    returning: LOT_RETURNING,
  })
  if (!built) return await inventoryLots.getOne(link.lot_id, executor)
  const { rows } = await query<Lot>(built.text, built.values, executor)
  return rows[0]
}

export async function settle(
  refining_order_id: string,
  assays: RefiningSettlementLot[],
  executor?: Executor
): Promise<RefiningLot[]> {
  const { rows } = await query<RefiningLot>(
    sql('settle'),
    [
      refining_order_id,
      assays.map((a) => a.lot_id),
      assays.map((a) => a.pre_melt ?? null),
      assays.map((a) => a.post_melt ?? null),
      assays.map((a) => a.purity ?? null),
      assays.map((a) => a.unit ?? null),
      assays.map((a) => a.premium ?? null),
      assays.map((a) => a.settled_spot ?? null),
    ],
    executor
  )
  return rows
}

export async function removeFor(refining_order_id: string, executor?: Executor): Promise<number> {
  const { rowCount } = await query(sql('delete_for_order'), [refining_order_id], executor)
  return rowCount ?? 0
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}
