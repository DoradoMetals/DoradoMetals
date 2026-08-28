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
import * as purchaseOrderService from "#features/purchase-orders/service.ts";
import * as refinerOrdersRepo from "#features/refiners/orders/repo.ts";

const refuse = (statusCode: number, message: string): never => {
  const err: Error & { statusCode?: number } = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

export type RefinerOrderPatch = {
  /** The refinery's spot per metal - dispatched to the same updateRefinerSpot
   *  path the old route used, addressed by the engagement now. */
  spots?: { name: string; bid: number }[];
  pool_oz_deducted?: number | null;
  pool_remediation?: number | null;
  fee?: number | null;
  refiner_id?: string | null;
};

const FIELDS = ["spots", "pool_oz_deducted", "pool_remediation", "fee", "refiner_id"] as const;

export function refusedField(
  body: Record<string, unknown>
): { statusCode: number; message: string } | null {
  const present = Object.keys(body ?? {});
  for (const field of present) {
    if (!(FIELDS as readonly string[]).includes(field)) {
      return { statusCode: 400, message: `"${field}" is not a field of a refiner order PATCH` };
    }
  }
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
  return null;
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
      await purchaseOrderService.updatePoolOzDeducted({
        purchase_order_id: orderId,
        pool_oz_deducted: body.pool_oz_deducted as number,
      });
    });
  }

  if (body.pool_remediation !== undefined) {
    await op("pool_remediation", async () => {
      await refinerOrdersRepo.setEngagementValue(id, "pool_remediation", body.pool_remediation!);
      await purchaseOrderService.updatePoolRemediation({
        purchase_order_id: orderId,
        pool_remediation: body.pool_remediation as number,
      });
    });
  }

  if (body.fee !== undefined) {
    await op("fee", async () => {
      await refinerOrdersRepo.setEngagementValue(id, "fee", body.fee!);
      await purchaseOrderService.updateRefinerFee({
        purchase_order_id: orderId,
        refiner_fee: body.fee as number,
      });
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
