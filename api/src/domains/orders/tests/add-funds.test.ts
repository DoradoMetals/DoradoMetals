import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder, aPayout } from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aSessionRow } from '#accounts/auth/tests/harness.ts'
import * as authSessions from '#db/auth/sessions/repo.ts'
import { STEP_UP_FRESH_SECONDS } from '#accounts/auth/rules.ts'

const FUNDS_LOCKS = [LOCKS.USERS, LOCKS.ORDERS]

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }
type OrderFixture = { id: string; user_id: string; total_price: string | null }

const admin: UserFixture = TEST_ACTOR

const TOTAL = 1234.56

const anOrderWorthSomething = async (
  c: PoolClient,
  method = 'DORADO_ACCOUNT'
): Promise<OrderFixture> => {
  const customer = await aUser(c, { funds: 0 })
  const order = await anOrder(c, customer, { direction: 'purchase' })
    .withLots(1)
    .withSpots()
    .withTotals({ total: TOTAL })
  await aPayout(c, customer, { method, order })
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

test('a second add_funds is refused, and the action names why', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const order = await anOrderWorthSomething(client)
      await asAdmin(admin, async () => {
        const findAddFunds = (body: { actions: { name: string; override: string | null }[] }) =>
          body.actions.find((a) => a.name === 'add_funds')

        const first = await request(app).post(`/api/orders/${order.id}/add_funds`).send({})
        assert.equal(first.status, 200, first.text)
        assert.equal(
          findAddFunds(first.body)?.override,
          'This order has already been credited to the customer balance',
          'a freshly-credited order should already warn against crediting it again'
        )

        const again = await request(app).post(`/api/orders/${order.id}/add_funds`).send({})
        assert.equal(again.status, 409, `a second credit answered ${again.status}: ${again.text}`)

        const { rows } = await client.query(
          `SELECT count(*)::int AS n, coalesce(sum(amount), 0) AS total
             FROM payments.ledger WHERE order_id = $1 AND type = 'Credit'`,
          [order.id]
        )
        assert.equal(rows[0].n, 1, 'the customer was credited twice')
        assert.equal(Number(rows[0].total).toFixed(2), TOTAL.toFixed(2))

        const balance = await client.query(
          `SELECT coalesce(dorado_funds, 0) AS funds FROM auth.users WHERE id = $1`,
          [order.user_id]
        )
        assert.equal(Number(balance.rows[0].funds).toFixed(2), TOTAL.toFixed(2))
      })
    },
    { actor: TEST_ACTOR.id, lock: FUNDS_LOCKS }
  )
})

test('crediting an already-credited order needs a reason AND a fresh session', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const order = await anOrderWorthSomething(client)
      const fresh = await aSessionRow(client, admin.id, 0)
      await asAdmin({ ...admin, session_id: fresh }, async () => {
        const first = await request(app).post(`/api/orders/${order.id}/add_funds`).send({})
        assert.equal(first.status, 200, first.text)
      })

      const stale = await aSessionRow(client, admin.id, STEP_UP_FRESH_SECONDS + 60)
      await asAdmin({ ...admin, session_id: stale }, async () => {
        const noReason = await request(app).post(`/api/orders/${order.id}/add_funds`).send({})
        assert.equal(noReason.status, 409, 'a second credit with no reason was not refused')

        const staleWithReason = await request(app)
          .post(`/api/orders/${order.id}/add_funds`)
          .send({ override_reason: 'confirmed twice with the customer over the phone' })
        assert.equal(
          staleWithReason.status,
          403,
          'a stale session with a reason still got through step_up_required'
        )
      })

      await authSessions.update(stale, { stepped_up_at: new Date().toISOString() }, client)
      await asAdmin({ ...admin, session_id: stale }, async () => {
        const steppedUp = await request(app)
          .post(`/api/orders/${order.id}/add_funds`)
          .send({ override_reason: 'confirmed twice with the customer over the phone' })
        assert.equal(
          steppedUp.status,
          200,
          `a reason plus a stepped-up session was still refused: ${steppedUp.text}`
        )
      })

      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM payments.ledger WHERE order_id = $1 AND type = 'Credit'`,
        [order.id]
      )
      assert.equal(rows[0].n, 2, 'the override should have credited the balance a second time')
    },
    { actor: TEST_ACTOR.id, lock: FUNDS_LOCKS }
  )
})

test('an order being paid out by wire is not credited to a Dorado balance', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const order = await anOrderWorthSomething(client, 'WIRE')
      await asAdmin(admin, async () => {
        const res = await request(app).post(`/api/orders/${order.id}/add_funds`).send({})
        assert.equal(res.status, 422, `answered ${res.status}: ${res.text}`)

        const { rows } = await client.query(
          `SELECT count(*)::int AS n FROM payments.ledger WHERE order_id = $1`,
          [order.id]
        )
        assert.equal(rows[0].n, 0, 'the wired order still moved a Dorado balance')
      })
    },
    { actor: TEST_ACTOR.id, lock: FUNDS_LOCKS }
  )
})
