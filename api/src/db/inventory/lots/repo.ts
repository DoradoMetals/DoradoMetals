import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { ARRIVED } from '#db/fulfillments/repo.ts'
import { columnsOf, returningOf } from '#shared/db/columns.ts'
import {
  InventoryLotView,
  InventoryMetal,
  Lot,
  LotDetailFacts,
  LotFilter,
  LotPatch,
  LotPosition,
  LotView,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(LotPatch)
const RETURNING = returningOf(Lot)

const POSITION = sql('position').trim().replaceAll('/*__fulfillment_arrived__*/', ARRIVED)
const OWN_LOT = sql('own_lot').trim()
const LIST_SQL = sql('list')
  .replaceAll('/*__lot_position__*/', POSITION)
  .replaceAll('/*__own_lot__*/', OWN_LOT)
const VIEW_ONE_SQL = sql('view_one').replaceAll('/*__lot_position__*/', POSITION)
const POSITION_OF_SQL = sql('position_of').replaceAll('/*__lot_position__*/', POSITION)
const INVENTORY_BY_METAL_SQL = sql('inventory_by_metal')
  .replaceAll('/*__lot_position__*/', POSITION)
  .replaceAll('/*__own_lot__*/', OWN_LOT)

export async function getOne(id: string, executor?: Executor): Promise<Lot | undefined> {
  const { rows } = await query<Lot>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getByIds(ids: string[], executor?: Executor): Promise<Lot[]> {
  if (ids.length === 0) return []
  const { rows } = await query<Lot>(sql('get_by_ids'), [ids], executor)
  return rows
}

export async function search(
  q: string | null,
  unassigned: boolean,
  executor?: Executor
): Promise<LotView[]> {
  const { rows } = await query(sql('search'), [q, unassigned], executor)
  return rows.map((row) => LotView.parse(row))
}

export async function list(filter: LotFilter, executor?: Executor): Promise<InventoryLotView[]> {
  const { rows } = await query(
    LIST_SQL,
    [
      filter.positions,
      filter.metal_id,
      filter.kind,
      filter.order_id,
      filter.refiner_id,
      filter.q,
      filter.unassigned,
    ],
    executor
  )
  return rows.map((row) => InventoryLotView.parse(row))
}

export async function detail(
  id: string,
  executor?: Executor
): Promise<LotDetailFacts | undefined> {
  const { rows } = await query<{ view: unknown }>(VIEW_ONE_SQL, [id], executor)
  return rows[0] === undefined ? undefined : LotDetailFacts.parse(rows[0].view)
}

export async function positionsOf(ids: string[], executor?: Executor): Promise<LotPosition[]> {
  if (ids.length === 0) return []
  const { rows } = await query(POSITION_OF_SQL, [ids], executor)
  return rows.map((row) => LotPosition.parse(row))
}

export async function inventoryByMetal(executor?: Executor): Promise<InventoryMetal[]> {
  const { rows } = await query(INVENTORY_BY_METAL_SQL, [], executor)
  return rows.map((row) => InventoryMetal.parse(row))
}

export async function combine(lot_ids: string[], executor?: Executor): Promise<Lot> {
  const { rows } = await query<Lot>(sql('combine'), [lot_ids], executor)
  return rows[0]
}

export async function linkCombined(
  lot_ids: string[],
  combined_into_id: string,
  executor?: Executor
): Promise<number> {
  const { rowCount } = await query(sql('combine_parents'), [combined_into_id, lot_ids], executor)
  return rowCount ?? 0
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
    table: 'inventory.lots',
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
