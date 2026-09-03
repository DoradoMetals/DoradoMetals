// The order's frozen spots, its own resource (ruling 26c): GET and PUT
// /orders/:id/spots. It KEEPS its own service because the refiner surfaces, the
// PDFs and the emails all read these with the metal name resolved.
//
// PURCHASE DIRECTION ONLY for the writes: a sale's spots are frozen at checkout.
// lock runs before set, so one document can pin and then adjust.
import * as ordersRepo from "#db/orders/repo.ts";
import * as spotsRepo from "#db/orders/spots/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import * as spotsFeed from "#domain/spots/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { refuse } from "#shared/http/refuse.ts";
import type { OrderSpotRow, OrderSpotRawRow } from "#db/orders/spots/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { OrderSpotRow, OrderSpotRawRow } from "#db/orders/spots/repo.ts";

// VERBATIM rows (rulings 9 + 12). The metal is its id; a display name is the
// client's to map. No spots answers [] rather than 404.
export async function rowsFor(
  orderId: string, executor?: Executor
): Promise<OrderSpotRawRow[]> {
  return await spotsRepo.getRowsFor(orderId, executor);
}

// The same rows with the metal's NAME joined on. Not a wire shape.
export async function namedFor(
  orderId: string, executor?: Executor
): Promise<OrderSpotRow[]> {
  return await spotsRepo.getFor(orderId, executor);
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

export async function setSpots(
  orderId: string, body: OrderSpotsPut
): Promise<OrderSpotRow[]> {
  const direction = await ordersRepo.directionOf(orderId);
  if (!direction) throw refuse(404, `no order ${orderId}`);
  if (direction !== "purchase") {
    throw refuse(
      400,
      `the spots PUT is a purchase-direction operation and this is a ${direction} order`
    );
  }

  const refusal = refusedField(body as Record<string, unknown>);
  if (refusal) throw refuse(refusal.statusCode, refusal.message);

  // SERVER-RESOLVED, never the body: the route this replaced took the browser's
  // copy of the feed, which decides what the business pays.
  const live = body.lock === true ? await spotsFeed.getSpotPrices() : [];

  await withTransaction(async (client) => {
    const idByName = await metalsRepo.idsByName(client);

    if (body.lock === true) {
      await ordersRepo.update(orderId, { spots_locked: true }, {}, client);
      for (const sp of live) {
        const metal_id = idByName.get(sp.name);
        if (metal_id) await spotsRepo.update(orderId, metal_id, { bid: sp.bid ?? null }, client);
      }
    } else if (body.lock === false) {
      await ordersRepo.update(orderId, { spots_locked: false }, {}, client);
      for (const row of await spotsRepo.getRowsFor(orderId, client)) {
        await spotsRepo.update(orderId, row.metal_id, { bid: null }, client);
      }
    }

    for (const edit of body.set ?? []) {
      const metal_id = idByName.get(edit.name);
      if (metal_id) await spotsRepo.update(orderId, metal_id, { bid: edit.bid }, client);
    }
  });

  return await namedFor(orderId);
}
