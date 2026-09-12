import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import { ARRIVED } from '#db/fulfillments/repo.ts'
import type {
  AbandonedSale,
  Direction,
  Order,
  OrderGuard,
  OrderListItem,
  OrderRead,
  OrderViewFacts,
  OrderWrite,
  SettledAwaiting,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'
import { columnsOf } from '#shared/db/columns.ts'
import {
  OrderGuard as Guard,
  OrderListItem as ListItem,
  OrderViewFacts as Facts,
  OrderWrite as Write,
} from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)
const ORDER_REFERENCE = sql('order_reference').trim()
export const ORDER_STATE = expression(sql('order_state')).replaceAll(
  '/*__fulfillment_arrived__*/',
  ARRIVED
)
const LIST_SQL = sql('list')
  .replace('/*__order_reference__*/', ORDER_REFERENCE)
  .replace('/*__order_state__*/', ORDER_STATE)
const VIEW_SQL = sql('view')
  .replace('/*__order_reference__*/', ORDER_REFERENCE)
  .replace('/*__order_state__*/', ORDER_STATE)

export async function exists(id: string, executor?: Executor): Promise<boolean> {
  const { rows } = await query<{ present: boolean }>(sql('exists'), [id], executor)
  return rows[0]?.present === true
}

export async function directionOf(id: string, executor?: Executor): Promise<Direction | null> {
  const { rows } = await query<{ direction: Direction }>(sql('direction_of'), [id], executor)
  return rows[0]?.direction ?? null
}

export async function list(
  direction: Direction | null,
  user_id: string | null,
  executor?: Executor
): Promise<OrderListItem[]> {
  const { rows } = await query<{ view: unknown }>(LIST_SQL, [direction, user_id], executor)
  return rows.map((row) => ListItem.parse(row.view))
}

export async function getOne(id: string, executor?: Executor): Promise<OrderRead | undefined> {
  const { rows } = await query<OrderRead>(sql('get_one'), [id], executor)
  return rows[0]
}

export async function view(id: string, executor?: Executor): Promise<OrderViewFacts | undefined> {
  const { rows } = await query(VIEW_SQL, [id], executor)
  return rows[0] === undefined ? undefined : Facts.parse(rows[0])
}

export async function ownerOf(id: string, executor?: Executor): Promise<string | null> {
  const { rows } = await query<{ user_id: string | null }>(sql('owner_of'), [id], executor)
  return rows[0]?.user_id ?? null
}

export const PATCHABLE = columnsOf(Write)
const GUARDABLE = columnsOf(Guard)

export async function update(
  id: string,
  patch: OrderWrite,
  guard: OrderGuard = {},
  executor?: Executor
): Promise<boolean> {
  const where: Record<string, unknown> = { id }
  for (const g of GUARDABLE) if (g in guard) where[g] = guard[g]
  const built = buildUpdate({
    table: 'orders.orders',
    allowed: PATCHABLE,
    patch,
    where,
    casts: { direction: 'orders.direction' },
    returning: 'id',
  })
  if (!built) return true
  const { rowCount } = await query(built.text, built.values, executor)
  return rowCount === 1
}

export async function findSalesAwaitingSettledIntent(
  executor?: Executor
): Promise<SettledAwaiting[]> {
  const { rows } = await query<SettledAwaiting>(
    sql('find_sales_awaiting_settled_intent'),
    [],
    executor
  )
  return rows
}

export async function findAbandonedSales(
  ttl_hours: number,
  executor?: Executor
): Promise<AbandonedSale[]> {
  const { rows } = await query<AbandonedSale>(sql('find_abandoned_sales'), [ttl_hours], executor)
  return rows
}

export async function createForCheckout(
  checkout_id: string,
  executor?: Executor
): Promise<Order | undefined> {
  const { rows } = await query<Order>(sql('create_from_checkout'), [checkout_id], executor)
  return rows[0]
}
