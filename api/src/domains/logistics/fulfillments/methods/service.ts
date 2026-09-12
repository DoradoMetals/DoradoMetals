import * as methods from '#db/fulfillments/methods/repo.ts'
import * as rules from '#logistics/fulfillments/rules.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { Direction, FulfillmentCategory, FulfillmentMethodRead } from '@dorado/contracts'

export async function listAvailable(
  direction: Direction,
  executor?: Executor
): Promise<FulfillmentMethodRead[]> {
  return await methods.getAvailable(direction, executor)
}

export async function listAll(executor?: Executor): Promise<FulfillmentMethodRead[]> {
  return await methods.getAll(executor)
}

export async function getOne(
  id: string,
  executor?: Executor
): Promise<FulfillmentMethodRead | undefined> {
  return await methods.getOne(id, executor)
}

export async function getDefault(
  direction: Direction,
  category: FulfillmentCategory,
  executor?: Executor
): Promise<FulfillmentMethodRead> {
  const method = await methods.getDefault(direction, category, executor)
  rules.assertDefault(method, direction, category)
  return method
}

export async function dropoffMethodId(executor?: Executor): Promise<string> {
  const method = await methods.getDropoff(executor)
  rules.assertDefault(method, 'refiner', 'DROPOFF')
  return method.id
}

export async function assertOffered(
  method_id: string,
  direction: Direction,
  executor?: Executor
): Promise<void> {
  rules.assertOffered(await methods.getAvailable(direction, executor), method_id, direction)
}
