import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as locks from '#db/spots/locks/repo.ts'
import * as spotLocks from '#db/orders/spot-locks/repo.ts'

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})

afterAll(async () => {
  await pool.end()
})

test('list carries a lock event with the figures that were in force', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withSpots({
      bid: 1234.5,
      ask: 1245.5,
    })
    await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
    await spotLocks.record(order.id, 'lock', c)

    const rows = await locks.list(c)
    const found = rows.find((r) => r.order_id === order.id && r.metal_id === 'Gold')
    assert.ok(found, 'the lock event is missing from the locks list')
    assert.equal(Number(found.bid), 1234.5)
    assert.equal(Number(found.ask), 1245.5)
    assert.equal(found.reference, `PO-${order.number}`)
    assert.equal(found.action, 'lock')
    assert.equal(found.state, 'Locked')
    assert.equal(found.direction, 'purchase')
    assert.ok(found.occurred_at, 'a lock event carries no occurred_at')
  })
})

test('an unlocked order still appears, which is what the old read could never do', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withSpots()
    await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
    await spotLocks.record(order.id, 'lock', c)
    await spotLocks.record(order.id, 'unlock', c)
    await c.query('UPDATE orders.orders SET spots_locked = false WHERE id = $1', [order.id])

    const rows = (await locks.list(c)).filter((r) => r.order_id === order.id)
    assert.ok(rows.length >= 2, 'an unlock left no event behind')
    assert.ok(
      rows.some((r) => r.action === 'unlock'),
      'the unlock event is missing from the log'
    )
    for (const row of rows) assert.equal(row.state, 'Unlocked')
  })
})

test('an order with no event carries no row', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withSpots()

    const rows = await locks.list(c)
    assert.ok(
      !rows.some((r) => r.order_id === order.id),
      'an order nobody locked showed up in the lock log'
    )
  })
})

test('a locked order that has a total reads Finalized and keeps its events', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
      .withSpots({ bid: 10, ask: 11 })
      .withTotals({ total: 500 })
    await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
    await spotLocks.record(order.id, 'lock', c)

    const rows = (await locks.list(c)).filter((r) => r.order_id === order.id)
    assert.ok(rows.length > 0, 'a finalized order lost its lock events')
    for (const row of rows) assert.equal(row.state, 'Finalized')
  })
})
