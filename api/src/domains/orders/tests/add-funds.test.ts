import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'

const FUNDS_LOCKS = [LOCKS.USERS, LOCKS.ORDERS]

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }
type OrderFixture = { id: string; user_id: string; total_price: string | null }

const admin: UserFixture = TEST_ACTOR

const TOTAL = 1234.56

const anOrderWorthSomething = async (c: PoolClient): Promise<OrderFixture> => {
  const customer = await aUser(c, { funds: 0 })
  const order = await anOrder(c, customer, { direction: 'purchase', status: 'Pending' })
    .withLots(1)
    .withSpots()
    .withTotals({ total: TOTAL })
  return { id: order.id, user_id: customer.id, total_price: String(TOTAL) }
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('the balance moves by exactly what the ledger records', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const order = await anOrderWorthSomething(client)
      await asAdmin(admin, async () => {
        const before = await client.query(
          `SELECT coalesce(dorado_funds, 0) AS funds FROM auth.users WHERE id = $1`,
          [order.user_id]
        )

        const res = await request(app).post(`/api/orders/${order.id}/add_funds`).send({})

        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const after = await client.query(
          `SELECT coalesce(dorado_funds, 0) AS funds FROM auth.users WHERE id = $1`,
          [order.user_id]
        )
        const moved = Number(after.rows[0].funds) - Number(before.rows[0].funds)

        const logged = await client.query(
          `SELECT amount FROM payments.ledger
          WHERE user_id = $1 AND order_id = $2 AND type = 'Credit'
          ORDER BY occurred_at DESC, id DESC LIMIT 1`,
          [order.user_id, order.id]
        )
        assert.ok(logged.rows[0], 'no ledger entry was written for the credit')

        assert.equal(
          Number(logged.rows[0].amount).toFixed(2),
          moved.toFixed(2),
          `credited ${moved.toFixed(2)} but the ledger says ${Number(logged.rows[0].amount).toFixed(2)}`
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: FUNDS_LOCKS }
  )
})

test('a spot write just before the credit does not reach the ledger', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const order = await anOrderWorthSomething(client)
      await asAdmin(admin, async () => {
        const countOf = async () =>
          Number(
            (
              await client.query(
                `SELECT count(*)::int AS n FROM payments.ledger
                WHERE user_id = $1 AND order_id = $2 AND type = 'Credit'`,
                [order.user_id, order.id]
              )
            ).rows[0].n
          )

        const before = await countOf()

        const {
          rows: [gold],
        } = await client.query(`SELECT id FROM metals.metals WHERE id = 'Gold'`)
        const zeroed = await request(app)
          .put(`/api/orders/${order.id}/spots`)
          .send({ set: [{ metal_id: gold.id, bid: 0 }] })
        assert.equal(zeroed.status, 200, `the spot write answered ${zeroed.status}`)

        const res = await request(app).post(`/api/orders/${order.id}/add_funds`).send({})
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.equal(await countOf(), before + 1, 'this request wrote no ledger entry')

        const logged = await client.query(
          `SELECT amount FROM payments.ledger
          WHERE user_id = $1 AND order_id = $2 AND type = 'Credit'
          ORDER BY occurred_at DESC, id DESC LIMIT 1`,
          [order.user_id, order.id]
        )
        assert.equal(
          Number(logged.rows[0].amount).toFixed(2),
          Number(order.total_price).toFixed(2),
          'the ledger amount followed the spot write that ran before it'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: FUNDS_LOCKS }
  )
})
