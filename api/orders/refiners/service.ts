import * as refiners from "#db/refiners/repo.ts";
import * as refinerOrders from "#db/refiners/orders/repo.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { RefinerView } from "@dorado/contracts";

export async function getAllRefiners(): Promise<RefinerView[]> {
  return await refiners.viewAll();
}

export async function getRefinerFromId(id: string): Promise<RefinerView | null> {
  return (await refiners.viewOne(id)) ?? null;
}

export async function engagementIdFor(order_id: string, executor?: Executor): Promise<string> {
  const existing = await refinerOrders.findByOrder(order_id, executor);
  if (existing) return existing.id;
  return (await refinerOrders.create({ order_id }, executor)).id;
}

export async function mirrorLinesForOrder(order_id: string, tx: Executor): Promise<void> {
  await refinerItems.mirrorForOrder(order_id, await engagementIdFor(order_id, tx), tx);
}

export async function mirrorForOrder(order_id: string, tx: Executor): Promise<void> {
  const refiner_order_id = await engagementIdFor(order_id, tx);
  await refinerItems.mirrorForOrder(order_id, refiner_order_id, tx);
  await refinerSpots.mirrorForOrder(order_id, refiner_order_id, tx);
}
