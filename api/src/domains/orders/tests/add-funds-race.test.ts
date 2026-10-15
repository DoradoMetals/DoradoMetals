import { test, afterAll, vi } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder, aPayout } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'

vi.mock('#transactions/ledger/service.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('#transactions/ledger/service.ts')>()
  return {
    ...real,
    hasCreditFor: async (order_id: string, executor?: Parameters<typeof real.hasCreditFor>[1]) =>
      executor === undefined ? false : await real.hasCreditFor(order_id, executor),
  }
})

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('a credit written by a second click after the first read is still refused under the balance lock', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c, { funds: 0 })
      const order = await anOrder(c, customer, { direction: 'purchase' })
        .withLots(1)
        .withSpots()
        .withTotals({ total: 500 })
      await aPayout(c, customer, { method: 'DORADO_ACCOUNT', order })
      await c.query(
        `INSERT INTO payments.ledger (user_id, type, order_id, amount) VALUES ($1, 'Credit', $2, 500)`,
        [customer.id, order.id]
      )

      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app).post(`/api/orders/${order.id}/add_funds`).send({})
        assert.equal(res.status, 409, `answered ${res.status}: ${JSON.stringify(res.body)}`)
      })

      const { rows } = await c.query(
        `SELECT count(*)::int AS n FROM payments.ledger WHERE order_id = $1 AND type = 'Credit'`,
        [order.id]
      )
      assert.equal(rows[0].n, 1, 'the order was credited twice')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.USERS, LOCKS.ORDERS] }
  )
})
