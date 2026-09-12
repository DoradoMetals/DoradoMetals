import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { columnsOf, returningOf } from '#shared/db/columns.ts'
import { OrderLot, OrderLotView } from '@dorado/contracts'
import type { OrderLotPatch } from '@dorado/contracts'
import type { SoldLotPrice } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

export const PATCHABLE = columnsOf(
  OrderLot.pick({ premium: true, price: true, sales_tax_charged: true, confirmed: true })
)
const RETURNING = returningOf(OrderLot)

export async function getOne(id: string, executor?: Executor): Promise<OrderLot | undefined> {
  const { rows } = await query<OrderLot>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function getByLot(lot_id: string, executor?: Executor): Promise<OrderLot | undefined> {
  const { rows } = await query<OrderLot>(sql('get_by_lot'), [lot_id], executor)
  return rows[0]
}

export async function getFor(order_id: string, executor?: Executor): Promise<OrderLot[]> {
  const { rows } = await query<OrderLot>(sql('get_for'), [order_id], executor)
  return rows
}

export async function viewFor(order_id: string, executor?: Executor): Promise<OrderLotView[]> {
  const { rows } = await query<{ view: unknown }>(sql('view_for'), [order_id], executor)
  return rows.map((row) => OrderLotView.parse(row.view))
}

export async function link(
  order_id: string,
  lot_id: string,
  executor?: Executor
): Promise<OrderLot> {
  const { rows } = await query<OrderLot>(sql('create'), [order_id, lot_id], executor)
  return rows[0]
}

export async function createBought(
  order_id: string,
  checkout_id: string,
  executor?: Executor
): Promise<OrderLot[]> {
  const { rows } = await query<OrderLot>(sql('create_bought'), [order_id, checkout_id], executor)
  return rows
}

export async function createSold(
  order_id: string,
  checkout_id: string,
  priced: SoldLotPrice[],
  executor?: Executor
): Promise<OrderLot[]> {
  const { rows } = await query<OrderLot>(
    sql('create_sold'),
    [
      order_id,
      checkout_id,
      priced.map((p) => p.lot_id),
      priced.map((p) => p.premium),
      priced.map((p) => p.sales_tax),
      priced.map((p) => p.price),
    ],
    executor
  )
  return rows
}

export async function update(
  id: string,
  patch: OrderLotPatch,
  executor?: Executor
): Promise<OrderLot | undefined> {
  const built = buildUpdate({
    table: 'orders.lots',
    allowed: PATCHABLE,
    patch,
    where: { id },
    returning: RETURNING,
  })
  if (!built) return await getOne(id, executor)
  const { rows } = await query<OrderLot>(built.text, built.values, executor)
  return rows[0]
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}
