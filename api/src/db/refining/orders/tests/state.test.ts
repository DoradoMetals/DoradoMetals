import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anOrder, aRefiningOrder } from '#shared/testing/builders/index.ts'
import * as refiningOrders from '#db/refining/orders/repo.ts'
import * as lots from '#db/inventory/lots/repo.ts'
import { OrderState } from '@dorado/contracts'

afterAll(async () => {
  await pool.end()
})

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

const sent = async (c: PoolClient, id: string): Promise<void> => {
  await c.query(`UPDATE refining.orders SET sent_at = now() WHERE id = $1`, [id])
}

test('an unsent refiner order is a Draft, whichever way it points', async () => {
  await inRollback(async (c: PoolClient) => {
    const seller = await aUser(c)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 2, premium: 0.9 })
      .withSpots({ bid: 100 })
    const sell = await aRefiningOrder(c, order, { direction: 'sell' })
    const buy = await aRefiningOrder(c, order, { direction: 'buy' })

    const draftSell = await refiningOrders.view(sell.id, c)
    const draftBuy = await refiningOrders.view(buy.id, c)
    assert.equal(draftSell?.state, 'Draft', 'an unsent sell order read as pending an assay')
    assert.equal(draftBuy?.state, 'Draft', 'an unsent buy order read as awaiting a delivery')

    await sent(c, sell.id)
    await sent(c, buy.id)

    assert.equal((await refiningOrders.view(sell.id, c))?.state, 'Pending Assay')
    assert.equal((await refiningOrders.view(buy.id, c))?.state, 'Awaiting Delivery')
  })
})

test('the state is Title Case, and every rung is a value of the one OrderState enum', async () => {
  await inRollback(async (c: PoolClient) => {
    const seller = await aUser(c)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 2, premium: 0.9 })
      .withSpots({ bid: 100 })
    const engagement = await aRefiningOrder(c, order, { direction: 'sell' })
    await sent(c, engagement.id)

    for (const expected of ['Pending Assay', 'Settled', 'Disputed', 'Cancelled'] as const) {
      if (expected === 'Settled') {
        await c.query(`UPDATE refining.orders SET settled_at = now() WHERE id = $1`, [
          engagement.id,
        ])
      }
      if (expected === 'Disputed') {
        await c.query(`UPDATE refining.orders SET disputed_at = now() WHERE id = $1`, [
          engagement.id,
        ])
      }
      if (expected === 'Cancelled') {
        await c.query(`UPDATE refining.orders SET cancelled_at = now() WHERE id = $1`, [
          engagement.id,
        ])
      }
      const view = await refiningOrders.view(engagement.id, c)
      assert.equal(view?.state, expected)
      assert.ok(
        OrderState.safeParse(view?.state).success,
        `${view?.state} is not a value of the one OrderState enum`
      )
    }
  })
})

test('the lot detail reads its refiner order through the same state expression', async () => {
  await inRollback(async (c: PoolClient) => {
    const seller = await aUser(c)
    const order = await anOrder(c, seller, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 2, premium: 0.9 })
      .withSpots({ bid: 100 })
    const engagement = await aRefiningOrder(c, order, { direction: 'sell' })

    const draft = await lots.detail(order.lots[0]!.lot_id, c)
    assert.equal(
      draft?.where.refining_order?.state,
      'Draft',
      'the lot card kept its own copy of the state ladder'
    )

    await sent(c, engagement.id)
    const after = await lots.detail(order.lots[0]!.lot_id, c)
    assert.equal(after?.where.refining_order?.state, 'Pending Assay')
  })
})
