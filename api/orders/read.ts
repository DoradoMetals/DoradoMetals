import * as ordersRepo from '#db/orders/repo.ts'
import * as rules from '#orders/rules.ts'
import { withDecisions } from '#shared/views.ts'
import type { Direction, OrderRead, OrderView } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function list(
  direction: Direction | null,
  user_id: string | null,
  executor?: Executor
): Promise<OrderRead[]> {
  return await ordersRepo.list(direction, user_id, executor)
}

export async function getOne(id: string, executor?: Executor): Promise<OrderRead | null> {
  return (await ordersRepo.getOne(id, executor)) ?? null
}

export async function view(order_id: string, executor?: Executor): Promise<OrderView | null> {
  const facts = await ordersRepo.view(order_id, executor)
  if (!facts) return null
  return withDecisions(facts, { actions: rules.actionsFor(facts) })
}
