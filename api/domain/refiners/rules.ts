import type { NewRefinerItem } from "#db/refiners/items/repo.ts";
import type { SpotNew } from "#db/refiners/spots/repo.ts";
import type { OrderSpot as OrderSpotRawRow } from "@dorado/contracts";
import type { EngagementSpotRow } from "#db/refiners/spots/repo.ts";
import type { OrderItem, RefinerItem } from "@dorado/contracts";

export function counterpartLines(
  refiner_order_id: string,
  lines: readonly OrderItem[],
  covered: readonly RefinerItem[]
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
