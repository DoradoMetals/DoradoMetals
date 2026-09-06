import { reportError } from '#shared/observability/report.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as spotsRepo from '#db/orders/spots/repo.ts'
import * as rules from '#orders/rules.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import type { OrderSpot, OrderSpotsPutBody } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function rowsFor(orderId: string, executor?: Executor): Promise<OrderSpot[]> {
  return await spotsRepo.getRowsFor(orderId, executor)
}

export async function setSpots(orderId: string, body: OrderSpotsPutBody): Promise<OrderSpot[]> {
  rules.assertDirection(await ordersRepo.directionOf(orderId), 'purchase', 'the spots PUT')
  rules.assertNamesASpotField(body)

  await withTransaction(async (tx) => {
    if (body.lock !== undefined) await applyLock(orderId, body.lock, tx)

    for (const edit of body.set ?? []) {
      await spotsRepo.update(orderId, edit.metal_id, { bid: edit.bid }, tx)
    }
  })

  return await rowsFor(orderId)
}

// Locking takes today's bid AND ask onto every frozen row; unlocking clears
// both (MP F10). One statement, and its row count is looked at: an order with
// no orders.spots rows repriced nothing and the caller was told it succeeded.
export async function applyLock(orderId: string, locked: boolean, tx: Executor): Promise<void> {
  await ordersRepo.update(orderId, { spots_locked: locked }, {}, tx)
  if ((await spotsRepo.setBidsFromFeed(orderId, locked, tx)) === 0) {
    reportError({
      at: 'orders.spots.applyLock',
      message:
        `order ${orderId} has no orders.spots rows, so the ` +
        `${locked ? 'lock' : 'unlock'} repriced nothing and the caller was ` +
        `told it succeeded`,
      extra: { order_id: orderId, lock: locked },
    })
  }
}
