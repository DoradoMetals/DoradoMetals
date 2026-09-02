// PATCH /api/refiners/orders/:id - the refiner engagement's own mutation
// surface.
//
// Jacob's rulings, 28 August: a fact about the refiner engagement lands on
// refiners.orders - the pool ounces, the remediation, the refinery's fee, and
// which refinery holds the metal. They were fields of the ORDER document only
// because exchange had nowhere else to keep them; shape follows resource
// ownership, endpoint follows the feature that owns the table.
//
// EVERY SHADOW STAYS LEVEL. The engagement's pool and fee values still have
// exchange columns (purchase_orders.pool_oz_deducted / pool_remediation /
// refiner_fee, mirrored onto orders.transactions by the dual write), and the
// EXISTING purchase-orders services are still their writers - each field
// below writes the engagement row and then dispatches the same service the
// old route called, so nothing is re-plumbed and exchange keeps every value.
// refiner_id has no shadow: exchange never recorded which refinery had an
// order's metal, which is half the reason this table exists.
//
// FIELD ORDER within one document: spots -> pool_oz_deducted ->
// pool_remediation -> fee -> refiner_id. Each field keeps the transaction
// semantics of the service it dispatches to; a failure names its field and
// the fields before it stand - the PATCH-surface rule everywhere else.
//
// A field this endpoint does not have is refused with a 400 naming it, never
// dropped - the same admin-mutation-urls argument the order PATCH makes.
import * as purchaseOrderService from "#features/orders/service.ts";
import * as orderTransactions from "#features/orders/transactions/service.ts";
import * as refinerOrdersRepo from "#features/refiners/orders/repo.ts";
import * as refinerSpotsRepo from "#features/refiners/spots/repo.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { RefinerOrderPatch } from "@dorado/contracts";

const refuse = (statusCode: number, message: string): never => {
  const err: Error & { statusCode?: number } = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

// THE BODY IS THE CONTRACT'S (A3), AND THE NULL QUESTION SPLIT FOUR-TO-ONE.
// This file typed all four writable values `| null` while
// frontend/features/refiners/queries.ts typed all four non-null, so the API
// advertised four CLEARs that no client could compile.
//
// The three pool/fee numbers lost their null: their exchange shadows -
// updatePoolOzDeducted, updatePoolRemediation, updateRefinerFee - are each
// typed `number` and this file reached them through `as number`, so the null
// was a cast rather than a capability, and every reader defaults them to 0.
// Clearing a pool deduction and setting it to 0 are the same order.
//
// `refiner_id` KEPT its null, and here the frontend was the side that was
// wrong. It is a nullable foreign key, not a fee: ensureForOrder inserts
// `(order_id)` alone so every engagement STARTS null, detaching an engagement
// from a refinery is a real operation, setEngagementValue already admits null,
// and there is no exchange shadow to disagree with.
export type { RefinerOrderPatch, RefinerSpotWrite } from "@dorado/contracts";

const FIELDS = Object.keys(RefinerOrderPatch.shape);

export function refusedField(body: Record<string, unknown>): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "a refiner order PATCH");
  if (unknown) return unknown;
  const present = Object.keys(body ?? {});
  if (present.length === 0) {
    return { statusCode: 400, message: "the document names no field to write" };
  }
  if (body.spots !== undefined) {
    if (!Array.isArray(body.spots) || body.spots.length === 0) {
      return { statusCode: 400, message: `"spots" must be a non-empty list of { name, bid }` };
    }
    for (const spot of body.spots as unknown[]) {
      const s = spot as { name?: unknown; bid?: unknown } | null;
      if (!s || typeof s.name !== "string" || typeof s.bid !== "number") {
        return { statusCode: 400, message: `"spots" entries are { name, bid }` };
      }
    }
  }
  return refusedValue(RefinerOrderPatch, body ?? {});
}

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
  body: RefinerOrderPatch & Record<string, unknown>
): Promise<unknown> {
  const refusal = refusedField(body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  const engagement = await refinerOrdersRepo.findById(id);
  if (!engagement) refuse(404, `no refiner order ${id}`);
  const orderId = engagement!.order_id;

  for (const spot of body.spots ?? []) {
    await op("spots", () =>
      purchaseOrderService.updateRefinerSpot({
        // The repos key the UPDATE on (purchase_order_id, name) and read
        // nothing else off the row; refiners.orders resolves the engagement
        // to its customer order and the existing dual-writing path does the
        // rest.
        spot: { purchase_order_id: orderId, name: spot.name } as never,
        updated_spot: spot.bid,
      })
    );
  }

  if (body.pool_oz_deducted !== undefined) {
    await op("pool_oz_deducted", async () => {
      await refinerOrdersRepo.setEngagementValue(id, "pool_oz_deducted", body.pool_oz_deducted!);
      await orderTransactions.update(orderId, { pool_oz_deducted: body.pool_oz_deducted! });
    });
  }

  if (body.pool_remediation !== undefined) {
    await op("pool_remediation", async () => {
      await refinerOrdersRepo.setEngagementValue(id, "pool_remediation", body.pool_remediation!);
      await orderTransactions.update(orderId, { pool_remediation: body.pool_remediation! });
    });
  }

  if (body.fee !== undefined) {
    await op("fee", async () => {
      await refinerOrdersRepo.setEngagementValue(id, "fee", body.fee!);
      await orderTransactions.update(orderId, { refiner_fee: body.fee! });
    });
  }

  if (body.refiner_id !== undefined) {
    // New-schema only, deliberately: exchange never recorded which refinery
    // had the metal, so there is no shadow to keep level.
    await op("refiner_id", () =>
      refinerOrdersRepo.setEngagementValue(id, "refiner_id", body.refiner_id ?? null)
    );
  }

  return await refinerOrdersRepo.findById(id);
}

// THE ENGAGEMENT, ADDRESSED BY THE CUSTOMER ORDER (GET /orders/:orderId/refiners): the order
// id is the key components actually hold, refiners.orders.order_id is the
// only edge between the two, and the wire must not smear the join product
// onto the order document. The bare row - its own id included - is how the
// engagement PATCH gets its key. Null when the order has no engagement (or
// does not exist); the controller answers 404, and telling those apart is
// nobody's business.
export async function getByOrder(
  order_id: string
): Promise<import("#features/refiners/orders/repo.ts").RefinerOrderRow | null> {
  return (await refinerOrdersRepo.findByOrder(order_id)) ?? null;
}

// The engagement's spots, by the same order-id key - chosen over the
// engagement-id spelling because it saves every component a chained read:
// spots render without waiting on the engagement row, which is only needed
// when a PATCH is about to be made. Null when there is no engagement; an
// engagement with no quotes stays a real [] answer.
// getSpotsByOrder MOVED to features/refiners/spots/service.ts as forOrder()
// (ruling 26c): it reads refiners.spots, so it belongs to that resource. The
// engagement lookup it does first is this feature's repo, which is a normal
// child-to-parent read.
