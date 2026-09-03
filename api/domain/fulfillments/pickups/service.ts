// DORADO'S OWN PICKUP: we collect the metal from the customer - not a carrier pickup (shipping.pickups is FedEx coming for a parcel). Two different concepts share one word; the database and this feature both keep them apart.
// This resource orchestrates for itself: a drawer reading an order's pickup, and an admin booking one, both reach here rather than through transport/fulfillments/controller.ts.
import { randomUUID } from "node:crypto";
import * as pickups from "#db/fulfillments/pickups/repo.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import type { PickupRow, PickupInput } from "#db/fulfillments/pickups/repo.ts";
import type { ComposedFulfillment } from "#domain/fulfillments/compose.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { PickupRow, PickupInput } from "#db/fulfillments/pickups/repo.ts";

// GET /api/orders/:orderId/pickups - VERBATIM rows, resolved from the order.
// An array of at most one - the plural is the route's, not the table's (fulfillments.pickups keys on fulfillment_id, upsert-only). [] instead of 404 lets a drawer render the same component for every method rather than branching before it asks.
export async function forOrder(
  order_id: string, executor?: Executor
): Promise<PickupRow[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor);
  if (!fulfillment) return [];
  const row = await pickups.getFor(fulfillment.id, executor);
  return row ? [row] : [];
}

// Booking one. Category is checked against the method, not trusted - a pickup row for a DROPSHIP fulfillment is a row every read attaches and none expects, and nothing in the schema would catch it.
export async function schedule(
  input: { fulfillment_id: string } & PickupInput, executor?: Executor
): Promise<ComposedFulfillment | null> {
  await fulfillmentService.assertCategory(input.fulfillment_id, "PICKUP", executor);
  await pickups.upsert(
    {
      id: randomUUID(),
      fulfillment_id: input.fulfillment_id,
      pickup_address_id: input.pickup_address_id,
      assigned_employee_id: input.assigned_employee_id,
      start_time: input.start_time,
      end_time: input.end_time,
    },
    executor
  );
  return await fulfillmentService.getById(input.fulfillment_id, executor);
}
