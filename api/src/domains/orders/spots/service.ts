import { reportError } from '#shared/observability/report.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as spotsRepo from '#db/orders/spots/repo.ts'
import * as spotLocks from '#db/orders/spot-locks/repo.ts'
import * as rules from '#orders/rules.ts'
import withTransaction from '#shared/db/withTransaction.ts'
import * as stepUp from '#accounts/auth/step-up.ts'
import type { OrderSpot, OrderSpotLockEvent, OrderSpotsPutBody } from '@dorado/contracts'
import type { Executor } from '#shared/db/executor.ts'

export async function rowsFor(orderId: string, executor?: Executor): Promise<OrderSpot[]> {
  return await spotsRepo.getRowsFor(orderId, executor)
}

export async function locksFor(orderId: string): Promise<OrderSpotLockEvent[]> {
  rules.assertOrder(await ordersRepo.directionOf(orderId), orderId)
  return await spotLocks.forOrder(orderId)
}

export async function setSpots(
  orderId: string,
  body: OrderSpotsPutBody,
  session_id: string | null = null
): Promise<OrderSpot[]> {
  rules.assertDirection(await ordersRepo.directionOf(orderId), 'purchase', 'the spots PUT')
  rules.assertNamesASpotField(body)
  if (body.set) await stepUp.assertSteppedUp(session_id)

  await withTransaction(async (tx) => {
    if (body.lock !== undefined) await applyLock(orderId, body.lock, tx)
    if (!body.set) return

    const order = await ordersRepo.getOne(orderId, tx)
    rules.assertOrder(order, orderId)
    rules.assertSpotsSettable(order, body.reason)
    for (const edit of body.set) {
      await spotsRepo.update(orderId, edit.metal_id, { bid: edit.bid }, tx)
    }
    await spotLocks.record(orderId, 'lock', tx, body.reason ?? null)
  })

  return await rowsFor(orderId)
}

export async function coverMetals(orderId: string, reason: string, tx: Executor): Promise<void> {
  await spotsRepo.coverMetals(orderId, reason, tx)
}

export async function applyLock(orderId: string, locked: boolean, tx: Executor): Promise<void> {
  if (locked) await spotsRepo.coverMetals(orderId, 'held at lock', tx)
  if (!locked) await spotLocks.record(orderId, 'unlock', tx)
  await ordersRepo.update(orderId, { spots_locked: locked }, {}, tx)
  const repriced = await spotsRepo.setBidsFromFeed(orderId, locked, tx)
  if (locked) await spotLocks.record(orderId, 'lock', tx)
  if (repriced === 0) {
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
