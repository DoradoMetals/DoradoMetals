// THE REFINERY'S QUOTED SPOTS: refiners.spots.
//
// Its own resource (ruling 26c). The rows belong to the ENGAGEMENT
// (refiners.orders) since 093 - order_item_id and order_id stay only as the
// link back to the customer's line - so a read keyed by the CUSTOMER order id
// resolves the engagement first and then reads this table. That resolution is
// the server's, in the WHERE clause (ruling 12); nothing nests on the wire.
//
// NO routes.ts: the one path this resource has, GET
// /api/orders/:orderId/refiners/spots, is declared by features/orders/routes.ts
// because the order id is the key the caller holds. The HANDLER is
// controller.ts here, because this feature owns the table.
import * as refinerOrdersRepo from "#features/refiners/orders/repo.ts";
import * as refinerSpotsRepo from "#features/refiners/spots/repo.ts";
import type { EngagementSpotRow } from "#features/refiners/spots/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { EngagementSpotRow, RefinerSpotRow } from "#features/refiners/spots/repo.ts";

// NULL means "that order has no engagement" - a 404 - as distinct from [],
// which means "the engagement exists and has quoted nothing yet". Collapsing
// the two would tell a caller an engagement exists when it does not.
export async function forOrder(
  order_id: string, executor?: Executor
): Promise<EngagementSpotRow[] | null> {
  const engagement = await refinerOrdersRepo.findByOrder(order_id, executor);
  if (!engagement) return null;
  return await refinerSpotsRepo.getForEngagement(engagement.id, executor);
}
