// Refiners: the composed reads, and the counterpart rows every order is born with.
import * as refiners from "#db/refiners/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import * as compose from "#domain/refiners/compose.ts";
import type { ComposedRefiner } from "#domain/refiners/compose.ts";
import type { Executor } from "#shared/db/executor.ts";

export async function getAllRefiners(): Promise<ComposedRefiner[]> {
  return await compose.all(await refiners.list());
}

export async function getRefinerFromId(id: string): Promise<ComposedRefiner | null> {
  const row = await refiners.getOne(id);
  if (!row) return null;
  return await compose.one(row);
}

// THE REFINER COUNTERPARTS OF A CUSTOMER ORDER (093's invariant): one
// engagement per order, one line per customer line, one cover per frozen spot.
// Values stay NULL until a refinery is actually involved.
export async function mirrorForOrder(order_id: string, executor?: Executor): Promise<void> {
  await refinerOrders.ensureForOrder(order_id, executor);
  await refinerItems.mirrorLinesForOrder(order_id, executor);
  await refinerSpots.coverFromOrderSpots(order_id, executor);
}
