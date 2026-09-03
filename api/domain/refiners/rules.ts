// The refiner counterparts a customer order is born with (093's invariant),
// derived as COMPLETE rows: one engagement per order, one line per customer
// line, one cover per frozen spot. Pure - no database, no request.
import type { NewRefinerItem } from "#db/refiners/items/repo.ts";
import type { SpotNew } from "#db/refiners/spots/repo.ts";
import type { OrderItemRow } from "#db/orders/items/repo.ts";
import type { OrderSpotRawRow } from "#db/orders/spots/repo.ts";
import type { RefinerItemRow } from "#db/refiners/items/repo.ts";
import type { EngagementSpotRow } from "#db/refiners/spots/repo.ts";

// A counterpart for every customer line that has none yet. bullion_id, metal_id
// and quantity ride over from the line; every assay column stays null until the
// refinery reports.
export function counterpartLines(
  refiner_order_id: string,
  lines: readonly OrderItemRow[],
  covered: readonly RefinerItemRow[]
): NewRefinerItem[] {
  const alreadyMirrored = new Set(covered.map((row) => row.order_item_id));
  return lines
    .filter((line) => !alreadyMirrored.has(line.id))
    .map((line) => ({
      order_item_id: line.id,
      refiner_order_id,
      bullion_id: line.bullion_id,
      metal_id: line.metal_id,
      quantity: line.quantity ?? 1,
    }));
}

// A cover for every metal the order froze a spot on and the refinery has not
// been asked about yet. Unquoted (ask/bid null) until the refinery speaks.
export function counterpartSpots(
  refiner_order_id: string,
  frozen: readonly OrderSpotRawRow[],
  covered: readonly EngagementSpotRow[]
): SpotNew[] {
  const alreadyCovered = new Set(covered.map((row) => row.metal_id));
  return frozen
    .filter((spot) => !alreadyCovered.has(spot.metal_id))
    .map((spot) => ({
      order_id: spot.order_id,
      metal_id: spot.metal_id,
      refiner_order_id,
    }));
}
