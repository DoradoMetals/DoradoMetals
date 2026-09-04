// The refinery's numbers on one customer line - refiners.items owns the
// per-line premium and the assay report, so its endpoint lives here rather
// than as a sub-document of the order PATCH.
//
// THE KEY IS THE ORDER ITEM'S ID: the order reads serve refiner values ON the
// item and never expose refiners.items' own row id, so the client holds
// exactly one honest key.
import * as orderItemsRepo from "#db/orders/items/repo.ts";
import * as refinerItemsRepo from "#db/refiners/items/repo.ts";
import { fineContent } from "#domain/pricing/content.ts";
import * as rules from "#domain/refiners/items/rules.ts";
import type { RefinerItemPatch, RefinerItem } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

// GET /api/orders/:orderId/refiners/items - the refinery's numbers per line,
// verbatim rows, keyed by the customer order.
export async function forOrder(
  order_id: string, executor?: Executor
): Promise<RefinerItem[]> {
  return await refinerItemsRepo.getForOrder(order_id, executor);
}

// The body is parsed strictly at transport; what is left is the RULE that a
// patch must name at least one field.
//
// THE ASSAY REPORT lands on THIS feature's row (D214 item 11). It used to be
// written through the ORDER's line edit, which meant a refinery's report could
// move the customer's DECLARED weight: orders.items.pre_melt is what the
// customer said they sent, and only the customer's declaration writes it.
export async function patchRefinerItem(
  order_item_id: string, patch: RefinerItemPatch
): Promise<RefinerItem> {
  rules.assertNamesAField(patch);

  if (patch.premium !== undefined) {
    await refinerItemsRepo.update(order_item_id, { premium: patch.premium });
  }

  if (
    patch.pre_melt !== undefined || patch.post_melt !== undefined ||
    patch.purity !== undefined || patch.unit !== undefined
  ) {
    const [line] = await orderItemsRepo.getByIds([order_item_id]);
    rules.assertScrapLine(line, order_item_id);
    const reported = (await refinerItemsRepo.byOrderItem([order_item_id])).get(order_item_id);
    await refinerItemsRepo.update(
      order_item_id, rules.assayedRow(patch, reported, line.unit, fineContent)
    );
  }

  const written = (await refinerItemsRepo.byOrderItem([order_item_id])).get(order_item_id);
  rules.assertRefinerItem(written, order_item_id);
  return written;
}

// The refinery's SPOTS are engagement facts and ride PATCH /api/refiners/orders/:id.
