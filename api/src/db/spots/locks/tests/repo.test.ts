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

const aLockedOrder = async (c: PoolClient) => {
  const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
    .withLines({ bullion_id: null, metal_id: 'Gold', content: 2.5, premium: 1, quantity: 1 })
    .withSpots({ bid: 1234.5, ask: 1245.5 })
  await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
  await spotLocks.record(order.id, 'lock', c)
  return order
}

test('a lock is active with its order, quantity and the figures in force', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await aLockedOrder(c)

    const page = await locks.page({ q: `PO-${order.number}`, page: 1 }, c)
    assert.ok(page.total >= 1)
    assert.equal(page.page_size, 8)
    const found = page.items.find((r) => r.order_id === order.id && r.metal_id === 'Gold')
    assert.ok(found, 'the search by reference missed the order')
    assert.equal(found.order_id, order.id)
    assert.equal(found.reference, `PO-${order.number}`)
    assert.equal(found.metal_id, 'Gold')
    assert.equal(found.quantity, 2.5)
    assert.equal(found.bid, 1234.5)
    assert.equal(found.ask, 1245.5)
    assert.equal(found.status, 'active')
    assert.equal(found.released_at, null)
    assert.equal(found.direction, 'purchase')

    const one = await locks.getOne(found.id, c)
    assert.equal(one?.status, 'active')
  })
})

test('an unlock releases the lock before it and a new lock is active again', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await aLockedOrder(c)
    const age = (minutes: number, action: string) =>
      c.query(
        `UPDATE orders.spot_locks SET created_at = now() - make_interval(mins => $3)
          WHERE order_id = $1 AND action = $2 AND created_at = now()`,
        [order.id, action, minutes]
      )
    await age(30, 'lock')
    await spotLocks.record(order.id, 'unlock', c)
    await age(20, 'unlock')
    await spotLocks.record(order.id, 'lock', c)

    const page = await locks.page(
      { metal: 'Gold', status: 'all', q: `PO-${order.number}`, page: 1 },
      c
    )
    const mine = page.items.filter((r) => r.order_id === order.id && r.metal_id === 'Gold')
    assert.equal(mine.length, 2, 'an unlock event was listed as a lock')
    assert.deepEqual(
      mine.map((r) => r.status),
      ['active', 'released']
    )
    assert.ok(mine[1].released_at, 'a released lock carries no release time')

    const released = await locks.page(
      { metal: 'Gold', q: `PO-${order.number}`, status: 'released', page: 1 },
      c
    )
    assert.equal(released.items.filter((r) => r.order_id === order.id).length, 1)
    assert.ok(released.items.every((r) => r.status === 'released'))
  })
})

test('the list filters by metal and pages by eight', async () => {
  await inRollback(async (c: PoolClient) => {
    for (let i = 0; i < 9; i += 1) await aLockedOrder(c)

    const all = await locks.page({ metal: 'Gold', status: 'all', page: 1 }, c)
    assert.ok(all.total >= 9)
    assert.equal(all.items.length, 8)
    const second = await locks.page({ metal: 'Gold', status: 'all', page: 2 }, c)
    assert.ok(second.items.length >= 1)
    assert.equal(second.page, 2)
    assert.ok(
      !second.items.some((r) => all.items.some((a) => a.id === r.id)),
      'page two repeated a row from page one'
    )

    const none = await locks.page({ metal: 'Not A Metal', page: 1 }, c)
    assert.deepEqual(none.items, [])
    assert.equal(none.total, 0)
  })
})

test('a lock nobody recorded is absent', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await locks.getOne('00000000-0000-4000-8000-000000000000', c), undefined)
  })
})

test('a lock reads active on an open order, released on a cancelled one, settled on a finalized one', async () => {
  await inRollback(async (c: PoolClient) => {
    const open = await aLockedOrder(c)
    const cancelled = await aLockedOrder(c)
    const finalized = await aLockedOrder(c)
    await c.query('UPDATE orders.orders SET cancelled_at = now() WHERE id = $1', [cancelled.id])
    await c.query(
      `INSERT INTO orders.transactions (order_id, total) VALUES ($1, 100)
       ON CONFLICT (order_id) DO UPDATE SET total = EXCLUDED.total`,
      [finalized.id]
    )

    const statusOf = async (order: { id: string; number: number }) => {
      const found = await locks.page({ status: 'all', q: `PO-${order.number}`, page: 1 }, c)
      return found.items.find((r) => r.order_id === order.id)?.status
    }
    assert.equal(await statusOf(open), 'active')
    assert.equal(await statusOf(cancelled), 'released')
    assert.equal(await statusOf(finalized), 'settled')

    const active = await locks.page({ status: 'active', page: 1 }, c)
    assert.ok(active.items.every((r) => r.status === 'active'))
    const settled = await locks.page({ status: 'settled', q: `PO-${finalized.number}`, page: 1 }, c)
    assert.ok(settled.items.some((r) => r.order_id === finalized.id))
    assert.ok(settled.items.every((r) => r.status === 'settled'))
  })
})
