import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'

const ORDER_LOCK = LOCKS.ORDERS

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }
type PayoutFixture = { id: string; order_id: string; cost: string | null }

let admin: UserFixture
let payout: PayoutFixture

beforeAll(async () => {
  admin = (
    await outside<UserFixture>(
      `SELECT id, name, email FROM auth.users WHERE role = 'admin' LIMIT 1`
    )
  )[0]
  assert.ok(admin, 'dev has no admin user')

  payout = (
    await outside<PayoutFixture>(
      `SELECT d.id, t.order_id, t.payout_fee AS cost
         FROM payments.details d
         JOIN orders.transactions t ON t.payout_details_id = d.id
         JOIN orders.orders o ON o.id = t.order_id
        WHERE o.direction = 'purchase'
        ORDER BY d.id LIMIT 1`
    )
  )[0]
  assert.ok(payout, 'dev needs a payout account attached to a purchase order')
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const readState = async (client: PoolClient) => {
  const { rows: next } = await client.query(
    `SELECT waive_payout_fee, payout_fee FROM orders.transactions WHERE order_id = $1`,
    [payout.order_id]
  )
  return {
    next: next[0]?.waive_payout_fee ?? null,
    cost: next[0]?.payout_fee ?? null,
  }
}

test('waiving sets the flag and leaves the stored fee alone', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await as({ ...admin, role: 'admin' }, async () => {
        const before = await readState(client)

        const res = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ waive_payout_fee: true })
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const after = await readState(client)
        assert.equal(after.next, true, 'orders.transactions.waive_payout_fee did not move')

        assert.equal(after.cost, before.cost, 'waiving overwrote the stored payout fee')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('un-waiving clears the flag and the stored fee is still the same number', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await as({ ...admin, role: 'admin' }, async () => {
        const before = await readState(client)

        const on = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ waive_payout_fee: true })
        assert.equal(on.status, 200, `waive answered ${on.status}`)

        const off = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ waive_payout_fee: false })
        assert.equal(off.status, 200, `un-waive answered ${off.status}`)

        const after = await readState(client)
        assert.equal(after.next, false, 'the flag did not come back off')
        assert.equal(after.cost, before.cost, 'a round trip through the waiver moved the fee')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a document may set the fee and waive it, and both are recorded', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await as({ ...admin, role: 'admin' }, async () => {
        const res = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ cost: 125, waive_payout_fee: true })
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const after = await readState(client)
        assert.equal(Number(after.cost), 125, 'the per-order fee did not land')
        assert.equal(after.next, true, 'the waiver did not land')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('waiving raises the order quote by exactly the stored fee', async () => {
  await inPinnedTransaction(
    async () => {
      await as({ ...admin, role: 'admin' }, async () => {
        const set = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ cost: 20, waive_payout_fee: false })
        assert.equal(set.status, 200, `setting the fee answered ${set.status}`)

        const charged = await request(app)
          .post('/api/quotes/order')
          .send({ order_id: payout.order_id })
        assert.equal(
          charged.status,
          200,
          `the quote answered ${charged.status}: ${JSON.stringify(charged.body)}`
        )

        const waive = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ waive_payout_fee: true })
        assert.equal(waive.status, 200, `waiving answered ${waive.status}`)

        const waived = await request(app)
          .post('/api/quotes/order')
          .send({ order_id: payout.order_id })
        assert.equal(waived.status, 200, `the waived quote answered ${waived.status}`)

        assert.equal(
          Number(waived.body.total) - Number(charged.body.total),
          20,
          'waiving the fee did not change what the order is worth'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a non-boolean waiver is refused by name and writes nothing', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await as({ ...admin, role: 'admin' }, async () => {
        const before = await readState(client)

        const res = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ waive_payout_fee: 'yes' })
        assert.equal(res.status, 400, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.match(res.body?.error?.message ?? '', /waive_payout_fee/)

        assert.deepEqual(await readState(client), before, 'a refused document still wrote')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('nothing this file did survived the transactions', async () => {
  const [row] = await outside<{ waive_payout_fee: boolean | null; cost: string | null }>(
    `SELECT t.waive_payout_fee, t.payout_fee AS cost
       FROM orders.transactions t
      WHERE t.payout_details_id = $1`,
    [payout.id]
  )
  assert.equal(row.cost, payout.cost, "a payout's real fee was moved in dev")
  assert.notEqual(row.waive_payout_fee, true, 'a real order was left with its fee waived')
})

test('changing the method lands on the named payout account', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await as({ ...admin, role: 'admin' }, async () => {
        const res = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ method: 'WIRE' })
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const { rows } = await client.query(
          `SELECT m.type FROM payments.details d
           JOIN payments.methods m ON m.id = d.method_id
          WHERE d.id = $1`,
          [payout.id]
        )
        assert.equal(rows[0]?.type, 'WIRE', 'the method change did not reach the account')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a method that names no payment method is refused, and nothing changes', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      await as({ ...admin, role: 'admin' }, async () => {
        const before = await client.query(`SELECT method_id FROM payments.details WHERE id = $1`, [
          payout.id,
        ])

        const res = await request(app)
          .patch(`/api/payments/details/${payout.id}`)
          .send({ method: 'NOT A METHOD' })
        assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const after = await client.query(`SELECT method_id FROM payments.details WHERE id = $1`, [
          payout.id,
        ])
        assert.equal(after.rows[0].method_id, before.rows[0].method_id, 'a refused change wrote')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})
