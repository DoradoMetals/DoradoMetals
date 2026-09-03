// A DIRECT: the customer comes to one of our locations.
//
// The third fulfillment method, alongside pickups (we collect) and shipments (a
// parcel). THIS RESOURCE ORCHESTRATES FOR ITSELF (ruling 26b): a drawer reading
// an order's appointment, and an admin booking one, reach here rather than
// through features/fulfillments/controller.ts.
import { randomUUID } from "node:crypto";
import * as directs from "#db/fulfillments/directs/repo.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import type { DirectRow, DirectInput } from "#db/fulfillments/directs/repo.ts";
import type { ComposedFulfillment } from "#domain/fulfillments/compose.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { DirectRow, DirectInput } from "#db/fulfillments/directs/repo.ts";

// GET /api/orders/:orderId/directs - VERBATIM rows. At most one, for the same
// reason pickups is: the writer is an upsert keyed on fulfillment_id. [] rather
// than 404 when the order has no fulfillment or is handed over another way.
export async function forOrder(
  order_id: string, executor?: Executor
): Promise<DirectRow[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor);
  if (!fulfillment) return [];
  const row = await directs.getFor(fulfillment.id, executor);
  return row ? [row] : [];
}

export async function schedule(
  input: { fulfillment_id: string } & DirectInput, executor?: Executor
): Promise<ComposedFulfillment | null> {
  await fulfillmentService.assertCategory(input.fulfillment_id, "DIRECT", executor);
  await directs.upsert(
    {
      id: randomUUID(),
      fulfillment_id: input.fulfillment_id,
      location_id: input.location_id,
      assigned_employee_id: input.assigned_employee_id,
      is_appointment: input.is_appointment,
      start_time: input.start_time,
      end_time: input.end_time,
    },
    executor
  );
  return await fulfillmentService.getById(input.fulfillment_id, executor);
}
