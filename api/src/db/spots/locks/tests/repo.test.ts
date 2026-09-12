import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as locks from '#db/spots/locks/repo.ts'

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

test('list carries a locked order and not an unlocked one', async () => {
  await inRollback(async (c: PoolClient) => {
    const locked = await anOrder(c, await aUser(c), { direction: 'purchase' }).withSpots({
      bid: 1234.5,
      ask: 1245.5,
    })
    const unlocked = await anOrder(c, await aUser(c), { direction: 'purchase' }).withSpots()

    await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [locked.id])

    const rows = await locks.list(c)
    const found = rows.find((r) => r.order_id === locked.id && r.metal_id === 'Gold')
    assert.ok(found, 'the locked order is missing from the locks list')
    assert.equal(Number(found.bid), 1234.5)
    assert.equal(Number(found.ask), 1245.5)
    assert.equal(found.reference, `PO-${locked.number}`)
    assert.ok(found.locked_at, 'a locked order carries no locked_at')

    assert.ok(
      !rows.some((r) => r.order_id === unlocked.id),
      'an order that was never locked showed up in the locks list'
    )
  })
})

test('an order carries no row until it is locked', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withSpots()

    const before = await locks.list(c)
    assert.ok(
      !before.some((r) => r.order_id === order.id),
      'an order was reported locked before spots_locked was set'
    )

    await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])

    const after = await locks.list(c)
    assert.ok(
      after.some((r) => r.order_id === order.id),
      'locking the order did not add it to the locks list'
    )
  })
})
