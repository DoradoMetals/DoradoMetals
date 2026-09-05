import * as pickups from '#db/fulfillments/pickups/repo.ts'
import * as fulfillments from '#db/fulfillments/repo.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import type { Executor } from '#shared/db/executor.ts'
import type { FulfillmentPickup, FulfillmentPickupPatch, FulfillmentView } from '@dorado/contracts'

export async function forOrder(
  order_id: string,
  executor?: Executor
): Promise<FulfillmentPickup[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor)
  if (!fulfillment) return []
  const row = await pickups.getFor(fulfillment.id, executor)
  return row ? [row] : []
}

export async function schedule(
  fulfillment_id: string,
  patch: FulfillmentPickupPatch,
  executor?: Executor
): Promise<FulfillmentView | null> {
  await fulfillmentService.assertCategory(fulfillment_id, 'PICKUP', executor)
  const existing = await pickups.getFor(fulfillment_id, executor)
  if (existing) {
    await pickups.update(fulfillment_id, patch, executor)
  } else {
    await pickups.create(
      {
        fulfillment_id,
        pickup_address_id: patch.pickup_address_id,
        assigned_employee_id: patch.assigned_employee_id,
        start_time: patch.start_time,
        end_time: patch.end_time,
      },
      executor
    )
  }
  return await fulfillmentService.getById(fulfillment_id, executor)
}
