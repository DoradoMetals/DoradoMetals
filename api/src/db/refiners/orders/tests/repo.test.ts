import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { LOCKS, takeLocks } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anOrder, aRefinerEngagement, refinerId } from '#shared/testing/builders/index.ts'
import * as refinerOrders from '#db/refiners/orders/repo.ts'

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

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

const anEngagement = async (c: PoolClient) => {
  const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
  return aRefinerEngagement(c, order)
}

test('update writes the pool/fee columns and leaves refiner_id alone', async () => {
  await inRollback(async (c: PoolClient) => {
    const engagement = await anEngagement(c)
    const row = { id: engagement.id, refiner_id: null }

    const changed = await refinerOrders.update(
      row.id,
      { pool_oz_deducted: 1.5, pool_remediation: 0.2, fee: 25 },
      c
    )
    assert.equal(changed, true, 'update reported no row changed')

    const {
      rows: [after],
    } = await c.query(
      `SELECT pool_oz_deducted, pool_remediation, fee, refiner_id FROM refiners.orders WHERE id = $1`,
      [row.id]
    )
    assert.equal(Number(after.pool_oz_deducted), 1.5)
    assert.equal(Number(after.pool_remediation), 0.2)
    assert.equal(Number(after.fee), 25)
    assert.equal(
      after.refiner_id,
      row.refiner_id,
      'refiner_id changed though the patch never named it'
    )
  })
})

test('refiner_id can be explicitly cleared to null', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await anEngagement(c)
    await c.query(`UPDATE refiners.orders SET refiner_id = $1 WHERE id = $2`, [
      await refinerId(c),
      row.id,
    ])

    const changed = await refinerOrders.update(row.id, { refiner_id: null }, c)
    assert.equal(changed, true, 'update reported no row changed')

    const {
      rows: [after],
    } = await c.query(`SELECT refiner_id FROM refiners.orders WHERE id = $1`, [row.id])
    assert.equal(after.refiner_id, null, 'refiner_id was not cleared')
  })
})

test('update answers false for an id with no refiners.orders row', async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await refinerOrders.update(randomUUID(), { fee: 1 }, c)
    assert.equal(changed, false, 'update reported a change for an id that does not exist')
  })
})
