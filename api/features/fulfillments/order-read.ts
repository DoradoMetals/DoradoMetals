// GET /api/orders/:orderId/fulfillments - THE BARE fulfillments.fulfillments
// ROW, verbatim, AND NOTHING ELSE (Jacob, wave 2 final form: "so our types
// don't spiral out of control and we don't have to do fucking prop drilling
// everywhere"). No method embed - methods are cached reference data the
// frontend maps by method_id off GET /fulfillments/methods - and no resolved
// children either: the shipment, pickup and direct reads are WAVE 3's, each
// parent-path (/orders/:orderId/shipments etc.), each owned by the feature
// owning the table, each returning verbatim rows, landed when the drawers
// actually consume them.
//
// The CODE lives with fulfillments because fulfillments owns the table; the
// PATH lives under /api/orders per the route convention - reads resolve from
// the parent path, writes key by the resource's own id.
import * as fulfillments from "#features/fulfillments/repo.ts";
import * as pickups from "#features/fulfillments/pickups/repo.ts";
import * as directs from "#features/fulfillments/directs/repo.ts";
import type { PickupRow } from "#features/fulfillments/pickups/repo.ts";
import type { DirectRow } from "#features/fulfillments/directs/repo.ts";
import type { FulfillmentBaseRow, Executor } from "#features/fulfillments/repo.ts";

// Null when the order has no fulfillment - a real state (nothing has been
// handed over yet, or the order predates the chain) that the controller
// answers 404 for, because the resource asked for does not exist.
export async function getOrderFulfillment(
  order_id: string, executor?: Executor
): Promise<FulfillmentBaseRow | null> {
  return (await fulfillments.getByOrder(order_id, executor)) ?? null;
}

// GET /api/orders/:orderId/pickups and /directs - the fulfillment's children,
// VERBATIM rows, resolved from the order in the WHERE clause.
//
// US COLLECTING FROM A CUSTOMER (a pickup) and A CUSTOMER COMING TO US (a
// direct) are the two non-shipment ways an order is handed over. Neither is a
// carrier booking: /shipments/:id/pickups is shipping.pickups, FedEx coming
// for a parcel, and the two tables share only a word.
//
// AN ARRAY OF AT MOST ONE, and the plural is the route's rather than the
// table's: fulfillments.pickups keys on fulfillment_id (its writer is an
// upsert ON CONFLICT), so one fulfillment has one pickup. A list is still the
// right answer - an order with no fulfillment, or one handed over by
// shipment, answers [] instead of 404, which lets a drawer render the same
// component for every method rather than branching before it asks.
export async function getOrderPickups(
  order_id: string, executor?: Executor
): Promise<PickupRow[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor);
  if (!fulfillment) return [];
  const row = await pickups.getFor(fulfillment.id, executor);
  return row ? [row] : [];
}

export async function getOrderDirects(
  order_id: string, executor?: Executor
): Promise<DirectRow[]> {
  const fulfillment = await fulfillments.getByOrder(order_id, executor);
  if (!fulfillment) return [];
  const row = await directs.getFor(fulfillment.id, executor);
  return row ? [row] : [];
}
