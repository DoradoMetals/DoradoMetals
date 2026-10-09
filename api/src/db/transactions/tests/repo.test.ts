import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as ledger from '#db/transactions/repo.ts'

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

test('create writes a real ledger entry, and byUser answers it', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)

    const row = await ledger.create(
      { user_id: user.id, type: 'Credit', order_id: null, amount: 42.5 },
      c
    )
    assert.equal(row.user_id, user.id)
    assert.equal(row.type, 'Credit')
    assert.equal(Number(row.amount), 42.5)

    const rows = await ledger.byUser(user.id, c)
    assert.ok(
      rows.some((r) => r.id === row.id),
      'byUser did not answer the entry just written'
    )
  })
})

test('hasCreditFor is true once a Credit is logged against the order, and false before', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' })

    assert.equal(
      await ledger.hasCreditFor(order.id, c),
      false,
      'hasCreditFor reported a credit before one was ever logged'
    )

    await ledger.create({ user_id: user.id, type: 'Credit', order_id: order.id, amount: 15 }, c)

    assert.equal(await ledger.hasCreditFor(order.id, c), true)
  })
})

test('hasCreditFor ignores a non-Credit entry against the same order', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' })

    await ledger.create({ user_id: user.id, type: 'Debit', order_id: order.id, amount: 15 }, c)

    assert.equal(
      await ledger.hasCreditFor(order.id, c),
      false,
      'a Debit entry was read as a Credit'
    )
  })
})

test('the audit trigger stamps the actor on a credit movement', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    await c.query(`SELECT set_config('app.actor_id', $1, true)`, [user.id])

    const written = await ledger.create(
      { user_id: user.id, type: 'Credit', order_id: null, amount: 25 },
      c
    )
    assert.equal(
      written.created_by_id,
      user.id,
      'payments.ledger carried the audit trigger with nowhere for it to write'
    )
  })
})
