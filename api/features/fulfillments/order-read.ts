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
import type { FulfillmentBaseRow } from "#features/fulfillments/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

// Null when the order has no fulfillment - a real state (nothing has been
// handed over yet, or the order predates the chain) that the controller
// answers 404 for, because the resource asked for does not exist.
export async function getOrderFulfillment(
  order_id: string, executor?: Executor
): Promise<FulfillmentBaseRow | null> {
  return (await fulfillments.getByOrder(order_id, executor)) ?? null;
}

// GET /api/orders/:orderId/pickups and /directs MOVED to the resources that
// own their tables - fulfillments/pickups/service.ts forOrder() and
// fulfillments/directs/service.ts forOrder() (ruling 26c). Their paths are
// still declared by features/orders/routes.ts; only the handler moved.
