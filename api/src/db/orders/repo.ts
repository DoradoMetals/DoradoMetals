import query from '#shared/db/query.ts'
import { buildUpdate } from '#shared/db/patch.ts'
import { expression, sqlFrom } from '#shared/db/sql.ts'
import { ARRIVED } from '#db/fulfillments/repo.ts'
import { LOT_POSITION } from '#db/inventory/lots/repo.ts'
import { ORDER_VALUE } from '#db/pricing/repo.ts'
import type {
  AbandonedSale,
  Direction,
  Order,
  OrderFilter,
  OrderGuard,
  OrderList,
  OrderRead,
  OrderSort,
  OrderViewFacts,
  OrderWrite,
  SearchHit,
  SettledAwaiting,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'
import { columnsOf } from '#shared/db/columns.ts'
import {
  OrderGuard as Guard,
  OrderList as List,
  OrderSort as Sort,
  OrderViewFacts as Facts,
  OrderWrite as Write,
  SearchHit as Hit,
} from '@dorado/contracts'

const sql = sqlFrom(import.meta.dirname)
const ORDER_REFERENCE = sql('order_reference').trim()
export const ORDER_STATE = expression(sql('order_state')).replaceAll(
  '/*__fulfillment_arrived__*/',
  ARRIVED
)
const LIST_SQL = sql('list')
  .replaceAll('/*__order_reference__*/', ORDER_REFERENCE)
  .replaceAll('/*__order_state__*/', ORDER_STATE)
  .replaceAll('/*__lot_position__*/', LOT_POSITION)
  .replaceAll('/*__order_estimated_value__*/', ORDER_VALUE)
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

export async function list(filter: OrderFilter, executor?: Executor): Promise<OrderList> {
  const { rows } = await query<{ view: unknown }>(
    LIST_SQL,
    [
      filter.direction ?? null,
      filter.user_id ?? null,
      filter.states ?? null,
      filter.assigned_to_id ?? null,
      filter.sort ?? null,
      filter.unassigned ?? null,
      filter.has_unassigned_lots ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    executor
  )
  return List.parse(rows[0]?.view)
}

export async function sorts(executor?: Executor): Promise<OrderSort[]> {
  const { rows } = await query(sql('list_sorts'), [], executor)
  return rows.map((row) => Sort.parse(row))
}

export async function search(q: string, executor?: Executor): Promise<SearchHit[]> {
  const { rows } = await query(sql('search'), [q], executor)
  return rows.map((row) => Hit.parse(row))
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
