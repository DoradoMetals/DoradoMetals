import * as orderItemsRepo from "#db/orders/items/repo.ts";
import * as refinerItemsRepo from "#db/refiners/items/repo.ts";
import { fineContent } from "#shared/utils/convertWeights.ts";
import * as rules from "#domain/refiners/items/rules.ts";
import type { RefinerItemPatch, RefinerItem } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

export async function forOrder(
  order_id: string, executor?: Executor
): Promise<RefinerItem[]> {
  return await refinerItemsRepo.getForOrder(order_id, executor);
}

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
