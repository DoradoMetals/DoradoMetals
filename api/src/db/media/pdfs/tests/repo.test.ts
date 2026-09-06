import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS, takeLocks } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as repo from '#db/media/pdfs/repo.ts'

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

const anOrderId = async (c: PoolClient) =>
  (await anOrder(c, await aUser(c), { direction: 'purchase' })).id

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

test('create writes a row and returns its id', async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderId(c)
    const written = await repo.create(
      {
        kind: 'packing_list',
        order_id: orderId,
        refining_order_id: null,
        path: `pdfs/${orderId}/packing_list-test.pdf`,
        size_bytes: 42,
        checksum: 'deadbeef',
      },
      c
    )
    assert.ok(written.id)
  })
})

test('latestOfKind reads back a row this transaction just wrote', async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderId(c)
    const written = await repo.create(
      {
        kind: 'invoice',
        order_id: orderId,
        refining_order_id: null,
        path: `pdfs/${orderId}/invoice-1.pdf`,
        size_bytes: 20,
        checksum: 'new-checksum',
      },
      c
    )

    const latest = await repo.latestOfKind('invoice', orderId, c)
    assert.equal(latest?.id, written.id)
    assert.equal(latest?.checksum, 'new-checksum')
  })
})

test('latestOfKind answers null for an order with no document at all', async () => {
  await inRollback(async (c) => {
    const latest = await repo.latestOfKind('invoice', await anOrderId(c), c)
    assert.equal(latest, null)
  })
})
