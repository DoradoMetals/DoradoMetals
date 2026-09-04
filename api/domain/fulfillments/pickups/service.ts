// DORADO'S OWN PICKUP: we collect the metal from the customer - not a carrier pickup (shipping.pickups is FedEx coming for a parcel). Two different concepts share one word; the database and this feature both keep them apart.
// This resource orchestrates for itself: a drawer reading an order's pickup, and an admin booking one, both reach here rather than through transport/fulfillments/controller.ts.
import { randomUUID } from "node:crypto";
import * as pickups from "#db/fulfillments/pickups/repo.ts";
import * as fulfillments from "#db/fulfillments/repo.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { FulfillmentPickup, FulfillmentPickupPatch, FulfillmentView } from "@dorado/contracts";

// GET /api/orders/:orderId/pickups - VERBATIM rows, resolved from the order.
// An array of at most one - the plural is the route's, not the table's (fulfillments.pickups holds one row per fulfillment). [] instead of 404 lets a drawer render the same component for every method rather than branching before it asks.
export async function forOrder(
  order_id: string, executor?: Executor
): Promise<FulfillmentPickup[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor);
  if (!fulfillment) return [];
  const row = await pickups.getFor(fulfillment.id, executor);
  return row ? [row] : [];
}

// Booking one. Category is checked against the method, not trusted - a pickup row for a DROPSHIP fulfillment is a row every read attaches and none expects, and nothing in the schema would catch it.
// READ FIRST: a fulfillment holds at most one pickup, so scheduling it a second time is a PATCH of the row already there, not a second insert.
export async function schedule(
  fulfillment_id: string, patch: FulfillmentPickupPatch, executor?: Executor
): Promise<FulfillmentView | null> {
  await fulfillmentService.assertCategory(fulfillment_id, "PICKUP", executor);
  const existing = await pickups.getFor(fulfillment_id, executor);
  if (existing) {
    await pickups.update(fulfillment_id, patch, executor);
  } else {
    await pickups.create(
      {
        id: randomUUID(), fulfillment_id,
        pickup_address_id: patch.pickup_address_id,
        assigned_employee_id: patch.assigned_employee_id,
        start_time: patch.start_time, end_time: patch.end_time,
      },
      executor
    );
  }
  return await fulfillmentService.getById(fulfillment_id, executor);
}
