import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import { columnsOf, returningOf } from '#shared/db/columns.ts'
import { LOT_PARENTS } from '#db/refining/lots/repo.ts'
import {
  RefiningOrder,
  RefiningOrderCreate,
  RefiningOrderListFacts,
  RefiningOrderPatch,
  RefiningOrderView,
  RefiningSpot,
} from '@dorado/contracts'
import type { OpenRefinerSale, RefiningOrderFilter } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)
export const REFINING_STATE = expression(sql('refining_state'))
const REFINING_VIEW = expression(sql('view_body'))
  .replaceAll('/*__refining_state__*/', REFINING_STATE)
  .replaceAll('/*__lot_parents__*/', LOT_PARENTS)
const VIEW_ONE_SQL = sql('view_one').replaceAll('/*__refining_view__*/', REFINING_VIEW)
const LIST_SQL = sql('list')
  .replaceAll('/*__refining_view__*/', REFINING_VIEW)
  .replaceAll('/*__refining_state__*/', REFINING_STATE)

export const PATCHABLE = columnsOf(RefiningOrderPatch)
const RETURNING = returningOf(RefiningOrder)

export async function getOne(id: string, executor?: Executor): Promise<RefiningOrder | undefined> {
  const { rows } = await query<RefiningOrder>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function findOpenSell(
  refiner_id: string,
  executor?: Executor
): Promise<OpenRefinerSale | undefined> {
  const { rows } = await query<OpenRefinerSale>(sql('find_open_sell'), [refiner_id], executor)
  return rows[0]
}

export async function create(
  row: RefiningOrderCreate,
  executor?: Executor
): Promise<RefiningOrder> {
  const { rows } = await query<RefiningOrder>(
    sql('create'),
    [
      row.refiner_id,
      row.direction,
      row.settlement_type ?? null,
      row.location_id ?? null,
      row.assigned_to_id ?? null,
    ],
    executor
  )
  return rows[0]
}

export async function view(
  id: string,
  executor?: Executor
): Promise<RefiningOrderView | undefined> {
  const { rows } = await query<{ view: unknown }>(VIEW_ONE_SQL, [id], executor)
  return rows[0] === undefined ? undefined : RefiningOrderView.parse(rows[0].view)
}

export async function list(
  filter: RefiningOrderFilter,
  executor?: Executor
): Promise<RefiningOrderListFacts> {
  const { rows } = await query<{ view: unknown }>(
    LIST_SQL,
    [
      filter.refiner_id ?? null,
      filter.direction ?? null,
      filter.state ?? null,
      filter.assigned_to_id ?? null,
      filter.sort ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    executor
  )
  return RefiningOrderListFacts.parse(rows[0]?.view)
}

export async function update(
  id: string,
  patch: RefiningOrderPatch,
  executor?: Executor
): Promise<RefiningOrder | undefined> {
  const built = buildUpdate({
    table: 'refining.orders',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning: RETURNING,
  })
  if (!built) return await getOne(id, executor)
  const { rows } = await query<RefiningOrder>(built.text, built.values, executor)
  return rows[0]
}

export async function send(id: string, executor?: Executor): Promise<RefiningOrder | undefined> {
  const { rows } = await query<RefiningOrder>(sql('send'), [id], executor)
  return rows[0]
}

export async function settle(
  id: string,
  fee: number | null,
  statement_reference: string | null,
  executor?: Executor
): Promise<RefiningOrder | undefined> {
  const { rows } = await query<RefiningOrder>(
    sql('settle'),
    [id, fee, statement_reference],
    executor
  )
  return rows[0]
}

export async function goodsMoved(id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ moved: boolean }>(sql('goods_moved'), [id], executor)
  return rows[0]?.moved === true
}

export async function cancel(id: string, executor?: Executor): Promise<RefiningOrder | undefined> {
  const { rows } = await query<RefiningOrder>(sql('cancel'), [id], executor)
  return rows[0]
}

export async function spots(id: string, executor?: Executor): Promise<RefiningSpot[]> {
  const { rows } = await query(sql('spots'), [id], executor)
  return rows.map((row) => RefiningSpot.parse(row))
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}
