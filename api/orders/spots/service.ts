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
    if (body.lock !== undefined) {
      await ordersRepo.update(orderId, { spots_locked: body.lock }, {}, tx)
      const repriced = await spotsRepo.setBidsFromFeed(orderId, body.lock, tx)
      if (repriced === 0) {
        reportError({
          at: 'orders.spots.setSpots',
          message:
            `order ${orderId} has no orders.spots rows, so the ` +
            `${body.lock ? 'lock' : 'unlock'} repriced nothing and the caller was ` +
            `told it succeeded`,
          extra: { order_id: orderId, lock: body.lock },
        })
      }
    }

    for (const edit of body.set ?? []) {
      await spotsRepo.update(orderId, edit.metal_id, { bid: edit.bid }, tx)
    }
  })

  return await rowsFor(orderId)
}
