import * as dropoffs from '#db/fulfillments/dropoffs/repo.ts'
import * as fulfillments from '#db/fulfillments/repo.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { FulfillmentDropoff } from '@dorado/contracts'

export async function forOrder(
  order_id: string,
  executor?: Executor
): Promise<FulfillmentDropoff[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor)
  if (!fulfillment) return []
  const row = await dropoffs.getFor(fulfillment.id, executor)
  return row ? [row] : []
}
