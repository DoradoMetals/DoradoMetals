// aRefinerEngagement - the refinery's side of a purchase order.
//
// AN ENGAGEMENT IS THE PARENT OF THE MIRROR. `refiners.orders` is one row per
// order sent to a refinery; `refiners.items` mirrors each customer line, and
// `refiners.spots` mirrors each metal's locked price. The invariant every test
// about this area asserts is that the three stay in step, so the builder
// always creates all three from an order that already has lines - a bare
// engagement with no mirror is a state the send path cannot produce, and no
// call site has ever asked for one (verified 2026-09-04: every call is bare
// `aRefinerEngagement(c, order)`).
import type { PoolClient } from "pg";
import { anId } from "#shared/testing/builders/ids.ts";
import * as engagements from "#db/refiners/orders/repo.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import type { BuiltOrder } from "#shared/testing/builders/orders.ts";
import type { RefinerSpot } from "@dorado/contracts";

export type BuiltEngagement = {
  id: string;
  order_id: string;
  item_ids: string[];
};

export async function aRefinerEngagement(
  c: PoolClient,
  order: BuiltOrder,
  spotOverrides: Partial<Pick<RefinerSpot, "bid" | "ask">> = {}
): Promise<BuiltEngagement> {
  const engagement = await engagements.create({ order_id: order.id }, c);
  const item_ids: string[] = [];

  for (const line of order.items) {
    const row = await refinerItems.create(
      {
        order_item_id: line.id,
        refiner_order_id: engagement.id,
        bullion_id: line.bullion_id,
        metal_id: line.metal_id,
        quantity: 1,
      },
      c
    );
    item_ids.push(row.id);
  }
  for (const metal_id of new Set(order.items.map((i) => i.metal_id))) {
    await refinerSpots.create(
      {
        id: anId(), order_id: order.id, refiner_order_id: engagement.id,
        metal_id, bid: spotOverrides.bid ?? 2400, ask: spotOverrides.ask ?? 2450,
      },
      c
    );
  }

  return { id: engagement.id, order_id: order.id, item_ids };
}
