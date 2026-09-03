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
import * as orderItemsRepo from "#db/orders/items/repo.ts";
import * as refinerItemsRepo from "#db/refiners/items/repo.ts";
import { scrapContent } from "#domain/orders/rules.ts";
import { Invalid, NotFound } from "#shared/errors.ts";
import type { RefinerItemPatch } from "@dorado/contracts";

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

// SHAPE VALIDATION HAPPENS ONCE, AT THE TRANSPORT BOUNDARY
// (transport/refiners/items/controller.ts strict-parses the body against this
// same RefinerItemPatch before this function ever runs - `content` naming its
// own refusal message lived there in the schema check; it is now a 400 that
// zod raises for an unknown key, same status, same field named). What is left
// here is a RULE, not a shape: a patch document must name at least one field,
// which no zod schema of all-optional fields can express on its own.
export async function patchRefinerItem(
  orderItemId: string,
  body: RefinerItemPatch
): Promise<{ success: true }> {
  if (Object.keys(body).length === 0) {
    throw new Invalid("the document names no field to write");
  }

  // The refinery's premium for the line - refiners.items.premium, with
  // exchange.purchase_order_items.refiner_premium as its shadow.
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

// The refinery's SPOTS are not here: they are engagement facts and ride
// PATCH /api/refiners/orders/:id (features/refiners/orders/service.ts),
// addressed by the refiners.orders row migration 093 creates.
