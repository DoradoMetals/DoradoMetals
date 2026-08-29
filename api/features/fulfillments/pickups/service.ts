// DORADO'S OWN PICKUP: we collect the metal from the customer.
//
// NOT a carrier pickup. shipping.pickups / exchange.carrier_pickups is FedEx
// coming for a parcel, and shipping.shipments.pickup_type
// (DROPOFF_AT_FEDEX_LOCATION / CONTACT_FEDEX_TO_SCHEDULE) is a property of a
// SHIPMENT. Two different concepts share one word; the database separates them
// correctly and so does this feature. This file is the fulfillment METHOD -
// alongside directs and shipments - and it never touches a carrier.
//
// THIS RESOURCE ORCHESTRATES FOR ITSELF (ruling 26b): a drawer reading an
// order's pickup, and an admin booking one, both reach here rather than
// through features/fulfillments/controller.ts.
import { randomUUID } from "node:crypto";
import * as pickups from "#features/fulfillments/pickups/repo.ts";
import * as fulfillments from "#features/fulfillments/repo.ts";
import * as fulfillmentService from "#features/fulfillments/service.ts";
import type { PickupRow, PickupInput } from "#features/fulfillments/pickups/repo.ts";
import type { ComposedFulfillment } from "#features/fulfillments/compose.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { PickupRow, PickupInput } from "#features/fulfillments/pickups/repo.ts";

// GET /api/orders/:orderId/pickups - VERBATIM rows, resolved from the order in
// the WHERE clause (ruling 12).
//
// AN ARRAY OF AT MOST ONE, and the plural is the route's rather than the
// table's: fulfillments.pickups keys on fulfillment_id (its writer is an upsert
// ON CONFLICT), so one fulfillment has one pickup. A list is still the right
// answer - an order with no fulfillment, or one handed over by shipment,
// answers [] instead of 404, which lets a drawer render the same component for
// every method rather than branching before it asks.
export async function forOrder(
  order_id: string, executor?: Executor
): Promise<PickupRow[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor);
  if (!fulfillment) return [];
  const row = await pickups.getFor(fulfillment.id, executor);
  return row ? [row] : [];
}

// Booking one. The category is checked against the method rather than trusted -
// writing a pickup row for a fulfillment whose method is DROPSHIP produces a
// row every read attaches and no read expects, and the constraint that would
// have caught it does not exist in the schema.
export async function schedule(
  input: { fulfillment_id: string } & PickupInput, executor?: Executor
): Promise<ComposedFulfillment | null> {
  await fulfillmentService.assertCategory(input.fulfillment_id, "PICKUP", executor);
  await pickups.upsert(randomUUID(), input.fulfillment_id, input, executor);
  return await fulfillmentService.getById(input.fulfillment_id, executor);
}
