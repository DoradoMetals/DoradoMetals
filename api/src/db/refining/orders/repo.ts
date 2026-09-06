import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf, returningOf } from '#shared/db/columns.ts'
import {
  RefiningOrder,
  RefiningOrderCreate,
  RefiningOrderPatch,
  RefiningOrderView,
  RefiningSpot,
} from '@dorado/contracts'
import type { RefiningDirection } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(RefiningOrderPatch)
const RETURNING = returningOf(RefiningOrder)

export async function getOne(id: string, executor?: Executor): Promise<RefiningOrder | undefined> {
  const { rows } = await query<RefiningOrder>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function findOpenSell(
  refiner_id: string,
  executor?: Executor
): Promise<RefiningOrder | undefined> {
  const { rows } = await query<RefiningOrder>(sql('find_open_sell'), [refiner_id], executor)
  return rows[0]
}

export async function create(
  row: RefiningOrderCreate,
  executor?: Executor
): Promise<RefiningOrder> {
  const { rows } = await query<RefiningOrder>(
    sql('create'),
    [row.refiner_id, row.direction],
    executor
  )
  return rows[0]
}

export async function view(
  id: string,
  executor?: Executor
): Promise<RefiningOrderView | undefined> {
  const { rows } = await query<{ view: unknown }>(sql('view_one'), [id], executor)
  return rows[0] === undefined ? undefined : RefiningOrderView.parse(rows[0].view)
}

export async function list(
  refiner_id: string | null,
  direction: RefiningDirection | null,
  state: string | null,
  executor?: Executor
): Promise<RefiningOrderView[]> {
  const { rows } = await query<{ view: unknown }>(
    sql('view_all'),
    [refiner_id, direction, state],
    executor
  )
  return rows.map((row) => RefiningOrderView.parse(row.view))
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
