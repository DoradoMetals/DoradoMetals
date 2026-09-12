import query from '#shared/db/query.ts'
import { sqlFrom } from '#shared/db/sql.ts'
import { OrderLotView } from '@dorado/contracts'
import type { OrderLot } from '@dorado/contracts'
import type { SoldLotPrice } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

const sql = sqlFrom(import.meta.dirname)

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
    ],
    executor
  )
  return rows
}

export async function adoptAssayProposal(order_id: string, executor?: Executor): Promise<unknown> {
  const { rows } = await query<{ proposal: unknown }>(
    sql('adopt_assay_proposal'),
    [order_id],
    executor
  )
  return rows[0]?.proposal
}

export async function mintFromStock(
  order_id: string,
  lot_id: string,
  executor?: Executor
): Promise<OrderLot> {
  const { rows } = await query<OrderLot>(sql('mint_from_stock'), [order_id, lot_id], executor)
  return rows[0]
}

export async function remove(id: string, executor?: Executor): Promise<boolean> {
  const { rowCount } = await query(sql('delete'), [id], executor)
  return rowCount === 1
}
