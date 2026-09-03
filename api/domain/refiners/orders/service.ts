// PATCH /api/refiners/orders/:id - the refiner engagement's own mutation
// surface.
//
// A fact about the refiner engagement lands on refiners.orders: the pool
// ounces, the remediation, the refinery's fee, and which refinery holds the
// metal - shape follows resource ownership, endpoint follows the feature
// that owns the table.
//
// EVERY SHADOW STAYS LEVEL: the engagement's pool and fee values still have
// exchange columns, mirrored onto orders.transactions, so each field below
// writes the engagement row and then dispatches the same service that kept
// them in sync before. refiner_id has no shadow - exchange never recorded
// which refinery had an order's metal.
//
// FIELD ORDER within one document: spots -> pool_oz_deducted ->
// pool_remediation -> fee -> refiner_id. Each field keeps the transaction
// semantics of the service it dispatches to; a failure names its field and
// the fields before it stand.
//
// A field this endpoint does not have is refused with a 400 naming it, never
// dropped.
import * as metalsRepo from "#db/metals/repo.ts";
import * as refinerSpotsRepo from "#db/refiners/spots/repo.ts";
import * as orderTransactions from "#domain/orders/transactions/service.ts";
import * as refinerOrdersRepo from "#db/refiners/orders/repo.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import type { RefinerOrderPatch } from "@dorado/contracts";

// The four writable values split on null: the three pool/fee numbers don't accept it (their exchange shadows are typed `number` and default to 0 — clearing a deduction and setting it to 0 are the same operation).
// `refiner_id` does accept null — it's a nullable foreign key, not a fee; every engagement starts null (ensureForOrder inserts `(order_id)` alone), and detaching one from a refinery is a real operation.
export type { RefinerOrderPatch, RefinerSpotWrite } from "@dorado/contracts";

// Shape validation happens once, at the transport boundary (controller.ts strict-parses against this same RefinerOrderPatch). What's left here is a RULE, not a shape: a patch must name at least one field.
async function op<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Error) {
      err.message = `${name}: ${err.message}`;
      throw err;
    }
    throw new Error(`${name}: ${String(err)}`);
  }
}

export async function patchRefinerOrder(
  id: string,
  body: RefinerOrderPatch
): Promise<unknown> {
  if (Object.keys(body).length === 0) {
    refuseWith(400, "the document names no field to write");
  }

  const engagement = await refinerOrdersRepo.findById(id);
  if (!engagement) refuseWith(404, `no refiner order ${id}`);
  const orderId = engagement!.order_id;

  // The refinery's bid per metal. refiners.spots is keyed on (order_id,
  // metal_id), so the NAME the drawer sends is resolved once here - this is a
  // refiners rule and no longer travels through the orders service.
  if (body.spots?.length) {
    const idByName = await metalsRepo.idsByName();
    for (const spot of body.spots) {
      const metal_id = idByName.get(spot.name);
      if (!metal_id) continue;
      await op("spots", () =>
        refinerSpotsRepo.update(orderId, metal_id, { bid: spot.bid })
      );
    }
  }

  if (body.pool_oz_deducted !== undefined) {
    await op("pool_oz_deducted", async () => {
      await refinerOrdersRepo.update(id, { pool_oz_deducted: body.pool_oz_deducted });
      await orderTransactions.update(orderId, { pool_oz_deducted: body.pool_oz_deducted! });
    });
  }

  if (body.pool_remediation !== undefined) {
    await op("pool_remediation", async () => {
      await refinerOrdersRepo.update(id, { pool_remediation: body.pool_remediation });
      await orderTransactions.update(orderId, { pool_remediation: body.pool_remediation! });
    });
  }

  if (body.fee !== undefined) {
    await op("fee", async () => {
      await refinerOrdersRepo.update(id, { fee: body.fee });
      await orderTransactions.update(orderId, { refiner_fee: body.fee! });
    });
  }

  if (body.refiner_id !== undefined) {
    // New-schema only, deliberately: exchange never recorded which refinery had the metal, so there's no shadow to keep level. `refiner_id` present in the patch (even null) is what tells the repo to write it — see db/refiners/orders/repo.ts's update().
    await op("refiner_id", () => refinerOrdersRepo.update(id, { refiner_id: body.refiner_id }));
  }

  return await refinerOrdersRepo.findById(id);
}

// The engagement, addressed by the customer order (GET /orders/:orderId/refiners): order_id is the only edge between the two, so the wire must not smear the join product onto the order document. Null when the order has no engagement; the controller answers 404.
export async function getByOrder(
  order_id: string
): Promise<import("#db/refiners/orders/repo.ts").RefinerOrderRow | null> {
  return (await refinerOrdersRepo.findByOrder(order_id)) ?? null;
}
