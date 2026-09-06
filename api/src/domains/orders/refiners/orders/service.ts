import * as refinerSpotsRepo from '#db/refiners/spots/repo.ts'
import * as orderTransactions from '#orders/transactions/service.ts'
import * as refinerOrdersRepo from '#db/refiners/orders/repo.ts'
import * as rules from '#orders/refiners/orders/rules.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { RefinerOrderPatch, RefinerOrderView } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

// Every write here is money, and the fee, the pool ounces and the pool
// remediation are each stored TWICE - once on the engagement the admin reads
// and once on orders.transactions the margin report reads. They ran as up to
// seven separate autocommitted statements, so a failure between two of them
// left the two copies disagreeing with nothing to reconcile them, and none of
// them was stamped with an actor because only withTransaction issues
// set_config('app.actor_id') (MP F6, migration 116).
export async function patchRefinerOrder(
  id: string,
  patch: RefinerOrderPatch
): Promise<RefinerOrderView> {
  rules.assertNamesAField(patch)

  const engagement = await refinerOrdersRepo.findById(id)
  rules.assertRefinerOrder(engagement, id)
  const order_id = engagement.order_id

  await withTransaction(async (tx) => {
    for (const spot of patch.spots ?? []) {
      await refinerSpotsRepo.update(order_id, spot.metal_id, { bid: spot.bid }, tx)
    }

    if (patch.pool_oz_deducted !== undefined) {
      await refinerOrdersRepo.update(id, { pool_oz_deducted: patch.pool_oz_deducted }, tx)
      await orderTransactions.update(order_id, { pool_oz_deducted: patch.pool_oz_deducted }, {}, tx)
    }

    if (patch.pool_remediation !== undefined) {
      await refinerOrdersRepo.update(id, { pool_remediation: patch.pool_remediation }, tx)
      await orderTransactions.update(order_id, { pool_remediation: patch.pool_remediation }, {}, tx)
    }

    if (patch.fee !== undefined) {
      await refinerOrdersRepo.update(id, { fee: patch.fee }, tx)
      await orderTransactions.update(order_id, { refiner_fee: patch.fee }, {}, tx)
    }

    if (patch.refiner_id !== undefined) {
      await refinerOrdersRepo.update(id, { refiner_id: patch.refiner_id }, tx)
    }
  })

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
