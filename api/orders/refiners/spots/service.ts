import * as refinerOrdersRepo from "#db/refiners/orders/repo.ts";
import * as refinerSpotsRepo from "#db/refiners/spots/repo.ts";
import type { OrderBid } from "#db/refiners/spots/repo.ts";
import type { Executor } from "#shared/db/executor.ts";
import type { RefinerSpot } from "@dorado/contracts";

export async function forOrder(
  order_id: string, executor?: Executor
): Promise<RefinerSpot[] | null> {
  const engagement = await refinerOrdersRepo.findByOrder(order_id, executor);
  if (!engagement) return null;
  return await refinerSpotsRepo.getForEngagement(engagement.id, executor);
}

export async function bidsFor(
  order_id: string, executor?: Executor
): Promise<OrderBid[]> {
  return await refinerSpotsRepo.getForOrder(order_id, executor);
}
