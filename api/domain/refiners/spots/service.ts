import * as refinerOrdersRepo from "#db/refiners/orders/repo.ts";
import * as refinerSpotsRepo from "#db/refiners/spots/repo.ts";
import type { EngagementSpotRow, NamedSpotRow } from "#db/refiners/spots/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

export type { EngagementSpotRow, RefinerSpotRow } from "#db/refiners/spots/repo.ts";

export async function forOrder(
  order_id: string, executor?: Executor
): Promise<EngagementSpotRow[] | null> {
  const engagement = await refinerOrdersRepo.findByOrder(order_id, executor);
  if (!engagement) return null;
  return await refinerSpotsRepo.getForEngagement(engagement.id, executor);
}

export async function namedFor(
  order_id: string, executor?: Executor
): Promise<NamedSpotRow[]> {
  return await refinerSpotsRepo.getNamed(order_id, executor);
}
