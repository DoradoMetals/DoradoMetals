import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as pricing from '#db/pricing/repo.ts'
import * as orders from '#db/orders/repo.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aProduct, aUser, anOrder, anUnknownId } from '#shared/testing/builders/index.ts'

afterAll(async () => {
  await pool.end()
})

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const EXACT = 1e-6

test('a selection sums the list estimate, counts lots, and weighs fine ounces per metal', async () => {
  await inOrders(async (c) => {
    const owner = await aUser(c)
    const product = await aProduct(c, { metal_id: 'Gold', content: 1 })
    const first = await anOrder(c, owner, { direction: 'purchase' })
      .withLines(
        { metal_id: 'Gold', content: 2, premium: 1, quantity: 1 },
        {
          metal_id: product.metal_id,
          bullion_id: product.id,
          content: product.content,
          premium: 0.8,
          quantity: 3,
        }
      )
      .withSpots({ bid: 2000 })
    const second = await anOrder(c, owner, { direction: 'purchase' })
      .withLines({ metal_id: 'Silver', content: 10, premium: 0.9, quantity: 1 })
      .withSpots({ bid: 30 })

    const summary = await pricing.selection([first.id, second.id], c)
    const listed = await orders.list({ user_id: owner.id }, c)
    const listedTotal = listed.items.reduce((sum, item) => sum + item.estimated_value, 0)

    assert.equal(summary.order_count, 2)
    assert.equal(summary.lot_count, 3)
    assert.ok(
      Math.abs(summary.estimated_value - listedTotal) < EXACT,
      `selection ${summary.estimated_value} != the list's own ${listedTotal}`
    )
    assert.deepEqual(summary.fine_oz, [
      { metal_id: 'Gold', oz: 5 },
      { metal_id: 'Silver', oz: 10 },
    ])
  })
})

test('a selection of unknown orders adds up to nothing', async () => {
  await inOrders(async (c) => {
    assert.deepEqual(await pricing.selection([anUnknownId()], c), {
      order_count: 0,
      lot_count: 0,
      estimated_value: 0,
      fine_oz: [],
    })
  })
})
