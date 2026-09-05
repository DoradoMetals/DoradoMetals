import * as refinerSpotsRepo from '#db/refiners/spots/repo.ts'
import * as orderTransactions from '#orders/transactions/service.ts'
import * as refinerOrdersRepo from '#db/refiners/orders/repo.ts'
import * as rules from '#orders/refiners/orders/rules.ts'
import type { RefinerOrderPatch, RefinerOrderView } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function patchRefinerOrder(
  id: string,
  patch: RefinerOrderPatch
): Promise<RefinerOrderView> {
  rules.assertNamesAField(patch)

  const engagement = await refinerOrdersRepo.findById(id)
  rules.assertRefinerOrder(engagement, id)
  const order_id = engagement.order_id

  for (const spot of patch.spots ?? []) {
    await refinerSpotsRepo.update(order_id, spot.metal_id, { bid: spot.bid })
  }

  if (patch.pool_oz_deducted !== undefined) {
    await refinerOrdersRepo.update(id, { pool_oz_deducted: patch.pool_oz_deducted })
    await orderTransactions.update(order_id, { pool_oz_deducted: patch.pool_oz_deducted })
  }

  if (patch.pool_remediation !== undefined) {
    await refinerOrdersRepo.update(id, { pool_remediation: patch.pool_remediation })
    await orderTransactions.update(order_id, { pool_remediation: patch.pool_remediation })
  }

  if (patch.fee !== undefined) {
    await refinerOrdersRepo.update(id, { fee: patch.fee })
    await orderTransactions.update(order_id, { refiner_fee: patch.fee })
  }

  if (patch.refiner_id !== undefined) {
    await refinerOrdersRepo.update(id, { refiner_id: patch.refiner_id })
  }

  const written = await refinerOrdersRepo.viewForOrder(order_id)
  rules.assertRefinerOrder(written, id)
  return written
}

export async function getByOrder(
  order_id: string,
  executor?: Executor
): Promise<RefinerOrderView | null> {
  return (await refinerOrdersRepo.viewForOrder(order_id, executor)) ?? null
}
