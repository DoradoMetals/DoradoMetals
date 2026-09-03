// GET /api/orders/:orderId/fulfillments - the bare fulfillments.fulfillments row, verbatim, and nothing else (Jacob: "so our types don't spiral out of control and we don't have to do fucking prop drilling everywhere"). No method embed (cached reference data, mapped by method_id) and no resolved children (shipment/pickup/direct are each their own parent-path read, owned by the feature owning the table).
// Code lives with fulfillments (owns the table); path lives under /api/orders (reads resolve from the parent path, writes key by the resource's own id).
import * as fulfillments from "#db/fulfillments/repo.ts";
import type { FulfillmentBaseRow } from "#db/fulfillments/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

// Null when the order has no fulfillment - a real state the controller answers 404 for, because the resource asked for does not exist.
export async function getOrderFulfillment(
  order_id: string, executor?: Executor
): Promise<FulfillmentBaseRow | null> {
  return (await fulfillments.getByOrder(order_id, executor)) ?? null;
}

// GET /api/orders/:orderId/pickups and /directs live in the resources that own their tables - fulfillments/pickups/service.ts forOrder() and fulfillments/directs/service.ts forOrder(). Their paths are still declared by transport/orders/routes.ts; only the handler lives elsewhere.
