// The order's frozen spots, its own resource (ruling 26c): GET and PUT
// /orders/:id/spots. It KEEPS its own service because the refiner surfaces, the
// PDFs and the emails all read these with the metal name resolved.
//
// PURCHASE DIRECTION ONLY for the writes: a sale's spots are frozen at checkout.
// lock runs before set, so one document can pin and then adjust.
import * as ordersRepo from "#db/orders/repo.ts";
import * as spotsRepo from "#db/orders/spots/repo.ts";
import * as spotsFeed from "#domain/spots/service.ts";
import * as rules from "#domain/orders/rules.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { Invalid } from "#shared/errors.ts";
import type { orders } from "@dorado/contracts";
import type { OrderSpotRow, OrderSpotRawRow } from "#db/orders/spots/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type OrderSpotsPut = orders.spots.PutBody;
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

// THE WRITE. `lock` pins the order at today's feed (or unpins it), and `set`
// adjusts a named metal's bid afterwards - one document can do both, in that
// order.
//
// THE METAL IS AN ID (ruling 43). `set` used to carry a metal NAME the server
// resolved against metals.metals, which meant a display string decided which
// row a money edit landed on.
export async function setSpots(
  orderId: string, body: orders.spots.PutBody
): Promise<OrderSpotRow[]> {
  rules.assertDirection(await ordersRepo.directionOf(orderId), "purchase", "the spots PUT");
  if (body.lock === undefined && !body.set) {
    throw new Invalid("the document names no field to write");
  }

  // SERVER-RESOLVED, never the body: the route this replaced took the browser's
  // copy of the feed, which decides what the business pays.
  const live = body.lock === true ? await spotsFeed.getSpotPrices() : [];
  const bidByMetal = new Map(live.map((quote) => [quote.id, quote.bid]));

  await withTransaction(async (tx) => {
    if (body.lock !== undefined) {
      await ordersRepo.update(orderId, { spots_locked: body.lock }, {}, tx);
      for (const row of await spotsRepo.getRowsFor(orderId, tx)) {
        await spotsRepo.update(
          orderId,
          row.metal_id,
          { bid: body.lock === true ? (bidByMetal.get(row.metal_id) ?? null) : null },
          tx
        );
      }
    }

    for (const edit of body.set ?? []) {
      await spotsRepo.update(orderId, edit.metal_id, { bid: edit.bid }, tx);
    }
  });

  return await namedFor(orderId);
}
