import * as ordersRepo from '#db/orders/repo.ts'
import * as rules from '#orders/rules.ts'
import { withDecisions } from '#shared/views.ts'
import type {
  OrderActivity,
  OrderActivityPage,
  OrderFilter,
  OrderList,
  OrderRead,
  OrderSort,
  OrderView,
  SearchHit,
} from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function sorts(executor?: Executor): Promise<OrderSort[]> {
  return await ordersRepo.sorts(executor)
}

export async function list(filter: OrderFilter, executor?: Executor): Promise<OrderList> {
  rules.assertKnownSort(filter.sort ?? null, await ordersRepo.sorts(executor))
  const facts = await ordersRepo.list(filter, executor)
  return withDecisions(facts, {
    items: facts.items.map((item) =>
      withDecisions(item, { actions: rules.actionsFor(item.action_facts) })
    ),
  })
}

export async function search(q: string, executor?: Executor): Promise<SearchHit[]> {
  return await ordersRepo.search(q, executor)
}

export async function getOne(id: string, executor?: Executor): Promise<OrderRead | null> {
  return (await ordersRepo.getOne(id, executor)) ?? null
}

export async function view(order_id: string, executor?: Executor): Promise<OrderView | null> {
  const facts = await ordersRepo.view(order_id, executor)
  if (!facts) return null
  return withDecisions(facts, { actions: rules.actionsFor(facts) })
}

export async function activity(
  order_id: string,
  page: OrderActivityPage,
  executor?: Executor
): Promise<OrderActivity[]> {
  rules.assertOrder(await ordersRepo.getOne(order_id, executor), order_id)
  return await ordersRepo.activity(order_id, page, executor)
}
