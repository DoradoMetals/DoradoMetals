// The refinery's numbers on an order, as the refiners feature's own writes.
//
// Jacob's principle (28 August): shape follows RESOURCE OWNERSHIP, endpoint
// follows the feature that owns the table. refiners.items owns the refinery's
// per-line premium and assay report, so its endpoint lives HERE, not as a
// sub-document of the order PATCH. The order-level engagement facts - the
// refinery's spots, the pool values, the fee, which refinery has the metal -
// are refiners.orders' (migration 093) and ride its own PATCH next door.
//
// THE WRITES ARE THE EXISTING DUAL-WRITING ONES, deliberately not re-plumbed:
// exchange's columns (purchase_order_items.refiner_premium, the scrap
// *_actual columns, refiner_metals) are the dual-written shadow of the
// refiners tables, and the purchase-orders services carry both schemas on
// every one of these paths. This service resolves keys and merges state; it
// opens no new write path.
//
// THE KEY IS THE ORDER ITEM'S ID. The order reads serve refiner values ON the
// item - refiner_premium and the scrap *_actual fields - and never expose
// refiners.items' own row id, so the client has exactly one honest key: the
// line's id. The route says so in its path (/items/by-order-item/:id).
import * as purchaseOrderService from "#domain/orders/service.ts";
import * as orderItemsRepo from "#db/orders/items/repo.ts";
import * as refinerItemsRepo from "#db/refiners/items/repo.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { RefinerItemPatch } from "@dorado/contracts";

const refuse = (statusCode: number, message: string): never => {
  const err: Error & { statusCode?: number } = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

// GET /api/orders/:orderId/refiners/items - THE REFINERY'S NUMBERS PER LINE,
// verbatim refiners.items rows, keyed by the customer order.
//
// This is where the assay figures live now. The composed order wire carried
// them as scrap.purity_actual / post_melt_actual / content_actual and the
// refiner's premium as an item field - four values of a different table, under
// different names, on a customer-shaped object. They come back as their own
// rows keyed by order_item_id, which the items read supplies.
export async function forOrder(
  order_id: string, executor?: import("pg").PoolClient
): Promise<import("#db/refiners/items/repo.ts").RefinerItemRow[]> {
  return await refinerItemsRepo.getForOrder(order_id, executor);
}

// THE BODY IS THE CONTRACT'S (A3). This is the one patch of the six whose two
// declarations already AGREED, and it is the reason the other four were decided
// on their own facts rather than by a rule: here `null` is a real value the
// admin drawer really sends. An assay figure that is not yet known IS null, and
// the merge below reads the current row and writes the document over it, so a
// null means "not measured" rather than "leave alone".
//
// `content` is deliberately NOT a field. refiners.items.content is DERIVED -
// the existing service computes it from post_melt (or pre_melt) and purity,
// exactly as the actual-values drawer has always had it computed - and a raw
// content override would need a new write path, which this feature refuses to
// open. The refusal names the field so nothing is silently recomputed over.
export type { RefinerItemPatch } from "@dorado/contracts";

const FIELDS = Object.keys(RefinerItemPatch.shape);

export function refusedField(body: Record<string, unknown>): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "a refiner item PATCH", (field) =>
    field === "content"
      ? `"content" is derived from post_melt and purity, not written`
      : null
  );
  if (unknown) return unknown;
  if (Object.keys(body ?? {}).length === 0) {
    return { statusCode: 400, message: "the document names no field to write" };
  }
  return refusedValue(RefinerItemPatch, body ?? {});
}

export async function patchRefinerItem(
  orderItemId: string,
  body: RefinerItemPatch & Record<string, unknown>
): Promise<{ success: true }> {
  const refusal = refusedField(body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  // The refinery's premium for the line - refiners.items.premium, with
  // exchange.purchase_order_items.refiner_premium as its shadow.
  if (body.premium !== undefined) {
    await refinerItemsRepo.setPremium(orderItemId, body.premium);
  }

  // The assay report - what the refinery says came back once the metal was
  // melted. The declared weights live on orders.items and the actuals on
  // refiners.items; the current values are read first and the patch merged
  // over them, because updateScrapItem writes every column it knows - a bare
  // patch would null what was not sent.
  if (
    body.pre_melt !== undefined || body.post_melt !== undefined ||
    body.purity !== undefined || body.unit !== undefined
  ) {
    const [line] = await orderItemsRepo.getByIds([orderItemId]);
    if (!line || line.bullion_id !== null) {
      refuse(404, `order item ${orderItemId} has no scrap line to report assay values on`);
    }
    const current = line!;
    const refiner = (await refinerItemsRepo.byOrderItem([orderItemId])).get(orderItemId);
    await purchaseOrderService.updateScrapItem({
      item: {
        id: current.id,
        premium: current.premium,
        scrap: {
          pre_melt: body.pre_melt !== undefined ? body.pre_melt : current.pre_melt,
          post_melt: current.post_melt,
          purity: current.purity,
          gross_unit: body.unit !== undefined ? body.unit : current.unit,
          // The refinery's report lands as the refiner line's own weights -
          // the mapping the old *_actual columns spelled out (post_melt <-
          // post_melt_actual, purity <- purity_actual; content the service
          // derives).
          purity_actual: body.purity !== undefined ? body.purity : refiner?.purity ?? null,
          post_melt_actual:
            body.post_melt !== undefined ? body.post_melt : refiner?.post_melt ?? null,
        },
      },
    } as never);
  }

  return { success: true };
}

// The refinery's SPOTS are not here: they are engagement facts and ride
// PATCH /api/refiners/orders/:id (features/refiners/orders/service.ts),
// addressed by the refiners.orders row migration 093 creates.
