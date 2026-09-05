import * as directs from "#db/fulfillments/directs/repo.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";
import * as fulfillmentService from "#logistics/fulfillments/service.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { FulfillmentDirect, FulfillmentDirectPatch, FulfillmentView } from "@dorado/contracts";

export async function forOrder(
  order_id: string, executor?: Executor
): Promise<FulfillmentDirect[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor);
  if (!fulfillment) return [];
  const row = await directs.getFor(fulfillment.id, executor);
  return row ? [row] : [];
}

export async function schedule(
  fulfillment_id: string, patch: FulfillmentDirectPatch, executor?: Executor
): Promise<FulfillmentView | null> {
  await fulfillmentService.assertCategory(fulfillment_id, "DIRECT", executor);
  const existing = await directs.getFor(fulfillment_id, executor);
  if (existing) {
    await directs.update(fulfillment_id, patch, executor);
  } else {
    await directs.create(
      {
        fulfillment_id,
        location_id: patch.location_id,
        assigned_employee_id: patch.assigned_employee_id,
        is_appointment: patch.is_appointment,
        start_time: patch.start_time, end_time: patch.end_time,
      },
      executor
    );
  }
  return await fulfillmentService.getById(fulfillment_id, executor);
}
