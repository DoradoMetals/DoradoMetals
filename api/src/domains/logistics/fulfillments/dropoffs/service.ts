import * as dropoffs from '#db/fulfillments/dropoffs/repo.ts'
import * as fulfillments from '#db/fulfillments/repo.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  FulfillmentDropoff,
  FulfillmentDropoffPatchColumns,
  FulfillmentView,
} from '@dorado/contracts'

export async function forOrder(
  order_id: string,
  executor?: Executor
): Promise<FulfillmentDropoff[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor)
  if (!fulfillment) return []
  const row = await dropoffs.getFor(fulfillment.id, executor)
  return row ? [row] : []
}

export async function schedule(
  fulfillment_id: string,
  patch: FulfillmentDropoffPatchColumns,
  executor?: Executor
): Promise<FulfillmentView | null> {
  await fulfillmentService.assertCategory(fulfillment_id, 'DROPOFF', executor)
  const existing = await dropoffs.getFor(fulfillment_id, executor)
  if (existing) {
    await dropoffs.update(fulfillment_id, patch, executor)
  } else {
    await dropoffs.create(
      {
        fulfillment_id,
        refiner_id: patch.refiner_id,
        location_id: patch.location_id,
        driver_employee_id: patch.driver_employee_id,
        start_time: patch.start_time,
        end_time: patch.end_time,
      },
      executor
    )
  }
  return await fulfillmentService.getById(fulfillment_id, executor)
}
