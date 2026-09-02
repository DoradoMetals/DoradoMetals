// THE ORDER'S LINES, as their own resource (ruling 26c).
//
//   GET    /api/orders/:id/items    the VERBATIM orders.items rows
//   POST   /api/orders/:id/items    a new line
//   PATCH  /api/orders/items/:id    a line's own edits
//   DELETE /api/orders/items/:id    a line's removal
//
// Jacob, stating the pattern: "If we want to update an order's items... that
// should hit the order/items orchestrator (controller) and call the domain
// logic (service), not the orders ones." THE ORDER SERVICE IS NOT IN THE PATH.
//
// orders.items is direction-unified (a purchase line and a sales line are one
// table), so the endpoint lives on the ORDERS feature rather than either
// direction's. Jacob's principle, final form (28 August): one endpoint per
// RESOURCE, owned by its feature.
//
// EVERY DISPATCH IS AN EXISTING DUAL-WRITING SERVICE - this moves routing,
// not logic. The line services live with purchase-orders because only the
// purchase flow edits lines today; the ROUTE lives here because the resource
// does.
//
//   scrap      -> updateScrapItem   the scrap-and-premium pair, one transaction
//   bullion    -> updateBullion     quantity and premium on a bullion line
//   confirmed  -> toggleOrderItemStatus(true)   the line is confirmed
//   reset      -> toggleOrderItemStatus(false)  ... and unconfirmed
//   DELETE     -> deleteOrderItems  the line, its scrap row, and the re-tier
//
// THE LINE'S ORDER AND SCRAP LINKAGE ARE RESOLVED SERVER-SIDE, never taken
// from the body: the toggle services need the order id and the delete needs
// the scrap id, and a caller-supplied linkage could name somebody else's
// rows. The request contributes values; the database contributes identity.
import * as ordersRepo from "#features/orders/repo.ts";
import * as itemsRepo from "#features/orders/items/repo.ts";
import * as purchaseOrderService from "#features/orders/service.ts";
import { refuseWith as refuse } from "#shared/http/refuse.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { OrderItemPatch } from "@dorado/contracts";
import type { OrderItemRow } from "#features/orders/items/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { OrderItemRow } from "#features/orders/items/repo.ts";

// GET /api/orders/:id/items - the order's LINES as VERBATIM orders.items rows
// (rulings 9 + 12). One table, both directions, scrap and bullion alike:
// bullion_id is the only product reference a line carries and null means
// scrap, which is what "combining scrap/bullion into just items" was for. A
// display name is the client's to map from the catalogue it already caches.
// An order with no lines answers [] - a real answer about a real order, not a
// 404.
export async function forOrder(
  orderId: string, executor?: Executor
): Promise<OrderItemRow[]> {
  return await itemsRepo.getFor(orderId, executor);
}

// POST /api/orders/:id/items - a new line. Purchase direction only: sales
// lines exist from checkout and no sales line-creation service exists to
// dispatch.
export async function createForOrder(
  orderId: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const direction = await ordersRepo.directionOf(orderId);
  if (!direction) refuse(404, `no order ${orderId}`);
  if (direction !== "purchase") {
    refuse(400, `line creation is a purchase-direction operation and this is a ${direction} order`);
  }
  if (!body?.item || typeof body.item !== "object") {
    refuse(400, `"item" is required`);
  }
  return await purchaseOrderService.createOrderItem({
    item: body.item as Record<string, unknown>,
    purchase_order_id: orderId,
  });
}

// THE BODY IS THE CONTRACT'S (A3). It was declared here and again in
// frontend/features/orders/items.ts, and the frontend's was the more accurate
// of the two: `scrap` is not an open record, it is `{ premium, scrap }` with
// BOTH members required, because updateScrapItem writes every column it knows
// and updateBullion's statement is `SET quantity = $1, premium = $2`
// unconditionally. A partial document does not leave the rest alone here - it
// NULLS it, which on a bullion line is how many coins the customer sent. The
// contract requires what the statement writes.
export type { OrderItemPatch, OrderItemScrapPatch, OrderItemBullionPatch } from "@dorado/contracts";

const FIELDS = Object.keys(OrderItemPatch.shape);

export function refusedField(body: Record<string, unknown>): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "an order item PATCH");
  if (unknown) return unknown;
  if (Object.keys(body ?? {}).length === 0) {
    return { statusCode: 400, message: "the document names no field to write" };
  }
  return refusedValue(OrderItemPatch, body ?? {});
}

// The line's identity, from the table that owns it. The scrap IS the line in
// the new schema, so there is no scrap id to resolve any more.
async function findLine(itemId: string): Promise<OrderItemRow | undefined> {
  const [row] = await itemsRepo.getByIds([itemId]);
  return row;
}

export async function patchOrderItem(
  itemId: string,
  body: OrderItemPatch & Record<string, unknown>
): Promise<{ success: true }> {
  const refusal = refusedField(body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  const line = await findLine(itemId);
  if (!line) refuse(404, `no order item ${itemId}`);

  if (body.scrap) {
    // The same body update_scrap_item took, with the line's id from the path
    // rather than the payload.
    await purchaseOrderService.updateScrapItem({
      item: { ...body.scrap, id: itemId } as never,
    });
  }

  if (body.bullion) {
    await purchaseOrderService.updateBullion({
      item: { id: itemId, quantity: body.bullion.quantity, premium: body.bullion.premium },
    });
  }

  if (body.confirmed === true || body.reset === true) {
    if (!line!.order_id) {
      refuse(422, `order item ${itemId} belongs to no purchase order, so it cannot be confirmed`);
    }
    await purchaseOrderService.toggleOrderItemStatus({
      item_status: body.confirmed === true,
      ids: [itemId],
      purchase_order_id: line!.order_id!,
    });
  }

  return { success: true };
}

export async function deleteOrderItem(itemId: string): Promise<{ success: true }> {
  const line = await findLine(itemId);
  if (!line) refuse(404, `no order item ${itemId}`);

  // The order comes from the row, not the request - the guarded delete and
  // the re-tier that follows both key on it.
  await purchaseOrderService.deleteOrderItems({
    items: [{ id: itemId, purchase_order_id: line!.order_id }],
  });

  return { success: true };
}
