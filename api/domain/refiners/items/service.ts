// The refinery's numbers on an order, as the refiners feature's own writes. Shape follows resource ownership: refiners.items owns the per-line premium/assay report, so its endpoint lives here, not as a sub-document of the order PATCH — refiners.orders owns the order-level engagement facts (spots, pool, fee) and rides its own PATCH next door.
// Keyed on the order item's id: the order reads serve refiner values ON the item and never expose refiners.items' own row id, so the client has exactly one honest key (the route says so in its path, /items/by-order-item/:id).
import * as purchaseOrderService from "#domain/orders/service.ts";
import * as orderItemsRepo from "#db/orders/items/repo.ts";
import * as refinerItemsRepo from "#db/refiners/items/repo.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import type { RefinerItemPatch } from "@dorado/contracts";

// GET /api/orders/:orderId/refiners/items — the refinery's numbers per line, verbatim refiners.items rows, keyed by the customer order.
// This is where the assay figures live now, as their own rows keyed by order_item_id — previously the composed order wire carried them as scrap.purity_actual/post_melt_actual/content_actual and a premium item field.
export async function forOrder(
  order_id: string, executor?: import("pg").PoolClient
): Promise<import("#db/refiners/items/repo.ts").RefinerItemRow[]> {
  return await refinerItemsRepo.getForOrder(order_id, executor);
}

// Here `null` is a real value: an unmeasured assay figure IS null, and the merge below reads the current row and writes the document over it, so null means "not measured", not "leave alone".
// `content` is deliberately NOT a field: refiners.items.content is DERIVED (from post_melt/pre_melt and purity) by the existing service, and a raw override would need a new write path this feature refuses to open.
export type { RefinerItemPatch } from "@dorado/contracts";

// Shape validation happens once, at the transport boundary (controller.ts strict-parses against this same RefinerItemPatch). What's left here is a RULE, not a shape: a patch must name at least one field, which an all-optional zod schema can't express on its own.
export async function patchRefinerItem(
  orderItemId: string,
  body: RefinerItemPatch
): Promise<{ success: true }> {
  if (Object.keys(body).length === 0) {
    refuseWith(400, "the document names no field to write");
  }

  // The refinery's premium for the line — refiners.items.premium.
  if (body.premium !== undefined) {
    await refinerItemsRepo.update(orderItemId, { premium: body.premium });
  }

  // The assay report: declared weights live on orders.items, actuals on refiners.items; current values are read first and the patch merged over them, because updateScrapItem writes every column it knows — a bare patch would null what wasn't sent.
  if (
    body.pre_melt !== undefined || body.post_melt !== undefined ||
    body.purity !== undefined || body.unit !== undefined
  ) {
    const [line] = await orderItemsRepo.getByIds([orderItemId]);
    if (!line || line.bullion_id !== null) {
      refuseWith(404, `order item ${orderItemId} has no scrap line to report assay values on`);
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
          // post_melt -> post_melt_actual, purity -> purity_actual; content is derived by the service.
          purity_actual: body.purity !== undefined ? body.purity : refiner?.purity ?? null,
          post_melt_actual:
            body.post_melt !== undefined ? body.post_melt : refiner?.post_melt ?? null,
        },
      },
    } as never);
  }

  return { success: true };
}

// The refinery's SPOTS are not here: they are engagement facts and ride PATCH /api/refiners/orders/:id (domain/refiners/orders/service.ts).
