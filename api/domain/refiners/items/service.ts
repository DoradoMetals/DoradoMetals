// The refinery's numbers on an order, as the refiners feature's own writes.
// Shape follows RESOURCE OWNERSHIP: refiners.items owns the per-line premium
// and assay report, so its endpoint lives HERE, not as a sub-document of the
// order PATCH - refiners.orders owns the order-level engagement facts
// (spots, pool, fee) and rides its own PATCH next door.
//
// THE KEY IS THE ORDER ITEM'S ID: the order reads serve refiner values ON
// the item and never expose refiners.items' own row id, so the client has
// exactly one honest key - the route says so in its path
// (/items/by-order-item/:id).
import * as orderItemsRepo from "#db/orders/items/repo.ts";
import * as refinerItemsRepo from "#db/refiners/items/repo.ts";
import { scrapContent } from "#domain/orders/rules.ts";
import { Invalid, NotFound } from "#shared/errors.ts";
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
    throw new Invalid("the document names no field to write");
  }

  // The refinery's premium for the line — refiners.items.premium.
  if (body.premium !== undefined) {
    await refinerItemsRepo.update(orderItemId, { premium: body.premium });
  }

  // THE ASSAY REPORT - what the refinery says came back once the metal was
  // melted, and it lands on THIS feature's own row (D214 item 11). It used to
  // be written through the ORDER's line edit, which meant a refinery's report
  // could move the customer's DECLARED weight: `orders.items.pre_melt` is what
  // the customer said they sent, and only the customer's declaration writes it.
  //
  // The current row is read first and the document merged over it, because
  // `content` is DERIVED from the weight, the unit and the purity - the same
  // rule the order's own line uses, so the two cannot compute it differently.
  if (
    body.pre_melt !== undefined || body.post_melt !== undefined ||
    body.purity !== undefined || body.unit !== undefined
  ) {
    const [line] = await orderItemsRepo.getByIds([orderItemId]);
    if (!line || line.bullion_id !== null) {
      throw new NotFound(`order item ${orderItemId} has no scrap line to report assay values on`);
    }
    const assayed = (await refinerItemsRepo.byOrderItem([orderItemId])).get(orderItemId);

    const pre_melt = body.pre_melt !== undefined ? body.pre_melt : (assayed?.pre_melt ?? null);
    const post_melt = body.post_melt !== undefined ? body.post_melt : (assayed?.post_melt ?? null);
    const purity = body.purity !== undefined ? body.purity : (assayed?.purity ?? null);
    const unit = body.unit !== undefined ? body.unit : (assayed?.unit ?? line.unit);

    await refinerItemsRepo.update(orderItemId, {
      pre_melt,
      post_melt,
      purity,
      unit,
      content: scrapContent(post_melt ?? pre_melt, unit, purity),
    });
  }

  return { success: true };
}

// The refinery's SPOTS are not here: they are engagement facts and ride PATCH /api/refiners/orders/:id (domain/refiners/orders/service.ts).
