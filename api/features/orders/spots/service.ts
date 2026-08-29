// THE ORDER'S FROZEN SPOTS, as their own resource (ruling 26c).
//
//   GET /api/orders/:id/spots   the VERBATIM orders.spots rows
//   PUT /api/orders/:id/spots   lock / unlock / set
//
// The paths are unchanged and still hang off the order id - reads resolve
// from the parent path (ruling 13) - but the call now runs
// controller -> orders/spots/service.ts, and THE ORDER SERVICE IS NOT IN THE
// PATH AT ALL. That is the whole point of 26c: a consumer that wants an
// order's spots depends on this resource, not on features/orders.
//
// PURCHASE DIRECTION ONLY for the writes: unlocking clears and locking pins
// through the purchase pipelines, and no sales spot edit exists to dispatch -
// a sale's quoted spots are frozen at checkout and stay.
//
// lock: true pins the LIVE spots, resolved server-side (the route this
// replaced took the browser's copy of the feed); lock: false unpins and
// clears; set writes named metals' bids on the frozen rows. lock runs before
// set, so one document can pin and then adjust - the sequence the drawer
// clicks.
import * as ordersRepo from "#features/orders/repo.ts";
import * as spotsRepo from "#features/orders/spots/repo.ts";
import * as purchaseOrderService from "#features/purchase-orders/service.ts";
import * as spotsFeed from "#features/spots/service.ts";
import { refuse } from "#shared/http/refuse.ts";
import type { OrderSpotRawRow } from "#features/orders/spots/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { OrderSpotRow, OrderSpotRawRow } from "#features/orders/spots/repo.ts";

// GET /api/orders/:id/spots - the spots an order was quoted at, as VERBATIM
// TABLE ROWS (rulings 9 + 12). One read serves both directions, because
// orders.spots is one table. The metal is its id; a display name is the
// client's to map from the spots reference read. An order with no spots
// (unlocked, or no metal quoted) answers [] rather than 404, because "no
// quotes yet" is an answer about a real order.
export async function rowsFor(
  orderId: string, executor?: Executor
): Promise<OrderSpotRawRow[]> {
  return await spotsRepo.getRowsFor(orderId, executor);
}

export type OrderSpotsPut = {
  lock?: boolean;
  set?: { name: string; bid: number }[];
};

const SPOT_FIELDS = ["lock", "set"] as const;

// The refusal this document earns, or null. Exported so the matrix can be
// asserted directly as well as over the wire.
export function refusedField(
  body: Record<string, unknown>
): { statusCode: number; message: string } | null {
  const present = Object.keys(body ?? {});
  for (const field of present) {
    if (!(SPOT_FIELDS as readonly string[]).includes(field)) {
      return { statusCode: 400, message: `"${field}" is not a field of the order spots PUT` };
    }
  }
  if (present.length === 0) {
    return { statusCode: 400, message: "the document names no field to write" };
  }
  if (body.set !== undefined) {
    if (!Array.isArray(body.set)) {
      return { statusCode: 400, message: `"set" must be a list of { name, bid }` };
    }
    for (const spot of body.set as unknown[]) {
      const s = spot as { name?: unknown; bid?: unknown } | null;
      if (!s || typeof s.name !== "string" || typeof s.bid !== "number") {
        return { statusCode: 400, message: `"set" entries are { name, bid }` };
      }
    }
  }
  return null;
}

// One field's dispatch, named in the error when it fails. Deliberate 4xx
// messages pass through with their own statusCode; anything else keeps its
// stack and gains the field's name.
async function op<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Error) {
      err.message = `${name}: ${err.message}`;
      throw err;
    }
    throw new Error(`${name}: ${String(err)}`);
  }
}

export async function put(
  orderId: string,
  body: OrderSpotsPut & Record<string, unknown>
): Promise<unknown> {
  const direction = await ordersRepo.directionOf(orderId);
  if (!direction) throw refuse(404, `no order ${orderId}`);
  if (direction !== "purchase") {
    throw refuse(
      400,
      `the spots PUT is a purchase-direction operation and this is a ${direction} order`
    );
  }

  const refusal = refusedField(body);
  if (refusal) throw refuse(refusal.statusCode, refusal.message);

  if (body.lock === true) {
    await op("lock", async () => {
      // SERVER-RESOLVED, never the body: the live feed comes from the spots
      // feature that owns it.
      const spots = await spotsFeed.getSpotPrices();
      return purchaseOrderService.lockSpots({ spots, purchase_order_id: orderId });
    });
  } else if (body.lock === false) {
    await op("lock", () => purchaseOrderService.unlockSpots({ purchase_order_id: orderId }));
  }

  for (const edit of body.set ?? []) {
    await op("set", () =>
      purchaseOrderService.updateSpot({
        // The repos key the UPDATE on (purchase_order_id, name) and read
        // nothing else off the row; the cast states that this partial is
        // deliberate.
        spot: { purchase_order_id: orderId, name: edit.name } as never,
        updated_spot: edit.bid,
      })
    );
  }

  return await purchaseOrderService.getMetalsForOrder(orderId);
}
