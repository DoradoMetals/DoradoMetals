// The refinery's quoted spots (refiners.spots) — its own resource, keyed by the ENGAGEMENT (refiners.orders); a read by the CUSTOMER order id resolves the engagement first, in the WHERE clause, so nothing nests on the wire.
// NO routes.ts: its one path, GET /api/orders/:orderId/refiners/spots, is declared by orders/routes.ts (the order id is the key the caller holds); the HANDLER lives in controller.ts here, because this feature owns the table.
import * as refinerOrdersRepo from "#db/refiners/orders/repo.ts";
import * as refinerSpotsRepo from "#db/refiners/spots/repo.ts";
import type { EngagementSpotRow } from "#db/refiners/spots/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { EngagementSpotRow, RefinerSpotRow } from "#db/refiners/spots/repo.ts";

// NULL means "that order has no engagement" (404), distinct from [] ("the engagement exists but has quoted nothing yet") — collapsing the two would claim an engagement that doesn't exist.
export async function forOrder(
  order_id: string, executor?: Executor
): Promise<EngagementSpotRow[] | null> {
  const engagement = await refinerOrdersRepo.findByOrder(order_id, executor);
  if (!engagement) return null;
  return await refinerSpotsRepo.getForEngagement(engagement.id, executor);
}
