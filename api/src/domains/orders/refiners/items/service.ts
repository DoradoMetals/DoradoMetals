import * as orderItemsRepo from '#db/orders/items/repo.ts'
import * as refinerItemsRepo from '#db/refiners/items/repo.ts'
import * as rules from '#orders/refiners/items/rules.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { RefinerItemPatch, RefinerItem } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function forOrder(order_id: string, executor?: Executor): Promise<RefinerItem[]> {
  return await refinerItemsRepo.getForOrder(order_id, executor)
}

// The assayed weights and the content derived from them are one edit, so they
// are one transaction (MP F6); the content itself is derived by
// metals.fine_content, the one definition (MA F4, MA F10).
export async function patchRefinerItem(
  order_item_id: string,
  patch: RefinerItemPatch
): Promise<RefinerItem> {
  rules.assertNamesAField(patch)

  await withTransaction(async (tx) => {
    if (patch.premium !== undefined) {
      await refinerItemsRepo.update(order_item_id, { premium: patch.premium }, tx)
    }

    if (!rules.reportsAnAssay(patch)) return

    const [line] = await orderItemsRepo.getByIds([order_item_id], tx)
    rules.assertScrapLine(line, order_item_id)
    const reported = (await refinerItemsRepo.byOrderItem([order_item_id], tx)).get(order_item_id)
    const assayed = rules.assayedRow(patch, reported, line.unit)
    rules.assertWeighable(assayed.unit, assayed.post_melt ?? assayed.pre_melt, assayed.purity)
    await refinerItemsRepo.update(order_item_id, assayed, tx)
    rules.assertContentDerived(
      await refinerItemsRepo.deriveContent(order_item_id, tx),
      order_item_id
    )
  })

  const written = (await refinerItemsRepo.byOrderItem([order_item_id])).get(order_item_id)
  rules.assertRefinerItem(written, order_item_id)
  return written
}
