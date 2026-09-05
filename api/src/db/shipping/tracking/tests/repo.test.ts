import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anOrder, aShipment } from '#shared/testing/builders/index.ts'
import * as tracking from '#db/shipping/tracking/repo.ts'

const inRollback = rollbackIn({ lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

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

test('insert writes every scan event via one UNNEST, and getFor answers them oldest first', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
    const shipment = await aShipment(c, order)

    const written = await tracking.insert(
      [
        { status: 'Picked up', location: 'Dallas, TX', date: '2026-01-01T09:00:00Z' },
        { status: 'Delivered', location: 'Houston, TX', date: '2026-01-02T09:00:00Z' },
      ],
      shipment.id,
      c
    )
    assert.equal(written, 2)

    const events = await tracking.getFor(shipment.id, c)
    assert.equal(events.length, 2)
    assert.equal(events[0]?.status, 'Picked up', 'events did not come back oldest first')
    assert.equal(events[1]?.status, 'Delivered')
  })
})

test('insert on an empty array writes nothing', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
    const shipment = await aShipment(c, order)

    assert.equal(await tracking.insert([], shipment.id, c), 0)
    assert.deepEqual(await tracking.getFor(shipment.id, c), [])
  })
})

test('remove answers the real count for a shipment with events, and zero for one with none', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
    const shipment = await aShipment(c, order)
    await tracking.insert(
      [{ status: 'Delivered', location: 'Houston, TX', date: '2026-01-02T09:00:00Z' }],
      shipment.id,
      c
    )

    const removed = await tracking.remove(shipment.id, c)
    assert.equal(removed, 1, 'remove did not report the real row count')
    assert.deepEqual(await tracking.getFor(shipment.id, c), [])

    const removedAgain = await tracking.remove(shipment.id, c)
    assert.equal(removedAgain, 0, 'remove reported a count for a shipment with no events left')
  })
})

test('remove answers zero for a shipment id that carries no tracking at all', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await tracking.remove(randomUUID(), c), 0)
  })
})
