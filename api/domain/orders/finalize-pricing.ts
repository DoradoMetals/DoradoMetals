// Finalizing an order's pricing, and only that: no status write rides along.
//
// EVERY NUMBER IS THE SERVER'S. calculateTotalPrice reads item.price verbatim,
// so a body-supplied spot would name the sum the business owes. ADMIN-ONLY.
import * as ordersRepo from "#db/orders/repo.ts";
import * as orderItems from "#db/orders/items/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import * as refinerSpots from "#db/refiners/spots/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import { calculateTotalPrice, calculateItemPrice } from "#domain/pricing/service.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import type { PricingSpot } from "#domain/pricing/service.ts";

// The three optional members are calculateTotalPrice's own subtrahends, named
// so a total cannot be computed from a shape that silently omits one.
type PricedOrder = {
  id: string;
  spots_locked?: boolean | null;
  order_items: Parameters<typeof calculateItemPrice>[0][];
  shipment?: { shipping_charge?: number | null } | null;
  payout?: { cost?: number | null } | null;
  waive_payout_fee?: boolean | null;
};

export async function finalizePricing({
  order,
  order_spots,
  spot_prices,
}: {
  order: PricedOrder;
  // Both arrays are resolved SERVER-side by the PATCH dispatch.
  order_spots: PricingSpot[];
  spot_prices: PricingSpot[];
}): Promise<PricingSpot[]> {
  return await withTransaction(async (client) => {
    const idByName = await metalsRepo.idsByName(client);
    const metalId = (name: unknown): string | undefined => idByName.get(String(name ?? ""));

    let spots: PricingSpot[];
    if (order.spots_locked) {
      spots = order_spots;
    } else {
      for (const sp of spot_prices) {
        const metal_id = metalId(sp.name);
        if (metal_id) await orderSpots.update(order.id, metal_id, { bid: sp.bid ?? null }, client);
      }
      spots = await orderSpots.getFor(order.id, client);
    }

    // The refiner's copies, keyed the same way.
    for (const sp of spots) {
      const metal_id = metalId(sp.name);
      if (metal_id) await refinerSpots.update(order.id, metal_id, { bid: sp.bid ?? null }, client);
    }

    for (const item of order.order_items) {
      await orderItems.update(
        (item as { id: string }).id,
        { price: calculateItemPrice(item, spots) ?? null },
        { order_id: order.id },
        client
      );
    }

    // The total, and the PIN: pricing an order freezes the spots it priced at.
    await orderTransactions.update(
      order.id, { total: calculateTotalPrice(order, spots) }, {}, client
    );
    await ordersRepo.update(order.id, { spots_locked: true }, {}, client);

    return spots;
  });
}
