// The refiner ENGAGEMENT's own mutation surface - refiners.orders: the pool
// ounces, the remediation, the refinery's fee, the refinery's quoted spots and
// which refinery holds the metal.
//
// The pool and fee values are ALSO mirrored onto orders.transactions, so each
// field writes the engagement row and then the same total, in one pass.
import * as refinerSpotsRepo from "#db/refiners/spots/repo.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import * as refinerOrdersRepo from "#db/refiners/orders/repo.ts";
import * as rules from "#domain/refiners/orders/rules.ts";
import type { RefinerOrderPatch, RefinerSpotWrite, RefinerOrder } from "@dorado/contracts";


// The body is parsed strictly at transport; what is left is the RULE that a
// patch must name at least one field, which an all-optional schema cannot say.
export async function patchRefinerOrder(
  id: string, patch: RefinerOrderPatch
): Promise<RefinerOrder> {
  rules.assertNamesAField(patch);

  const engagement = await refinerOrdersRepo.findById(id);
  rules.assertRefinerOrder(engagement, id);
  const order_id = engagement.order_id;

  // The refinery's bid per metal, keyed by metal ID - refiners.spots is keyed
  // on (order_id, metal_id) and the client holds both.
  for (const spot of patch.spots ?? []) {
    await refinerSpotsRepo.update(order_id, spot.metal_id, { bid: spot.bid });
  }

  if (patch.pool_oz_deducted !== undefined) {
    await refinerOrdersRepo.update(id, { pool_oz_deducted: patch.pool_oz_deducted });
    await orderTransactions.update(order_id, { pool_oz_deducted: patch.pool_oz_deducted });
  }

  if (patch.pool_remediation !== undefined) {
    await refinerOrdersRepo.update(id, { pool_remediation: patch.pool_remediation });
    await orderTransactions.update(order_id, { pool_remediation: patch.pool_remediation });
  }

  if (patch.fee !== undefined) {
    await refinerOrdersRepo.update(id, { fee: patch.fee });
    await orderTransactions.update(order_id, { refiner_fee: patch.fee });
  }

  // New-schema only: exchange never recorded which refinery had the metal, so
  // there is no total to keep level. Present in the patch (even null) is what
  // tells the repo to write it.
  if (patch.refiner_id !== undefined) {
    await refinerOrdersRepo.update(id, { refiner_id: patch.refiner_id });
  }

  const written = await refinerOrdersRepo.findById(id);
  rules.assertRefinerOrder(written, id);
  return written;
}

// The engagement, addressed by the customer order (GET /orders/:orderId/refiners):
// order_id is the only edge between the two. Null when the order has none.
export async function getByOrder(order_id: string): Promise<RefinerOrder | null> {
  return (await refinerOrdersRepo.findByOrder(order_id)) ?? null;
}
