import { test, afterAll, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as moovFake from '#providers/moov/fake.ts'
import * as plaidFake from '#providers/plaid/fake.ts'
import { FundingSource } from '@dorado/contracts'

process.env.MOOV_ACCOUNT_ID = 'acct_platform'

await mockSessions()
const { default: app } = await import('#app')
const banks = await import('#transactions/banks/service.ts')

beforeEach(() => {
  moovFake.reset()
  plaidFake.reset()
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const admin = { ...TEST_ACTOR, role: 'admin' }
const LOCK = [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS, LOCKS.FULFILLMENTS]
const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCK })

test('the funding sources are rows, Dorado operating first, staff only', async () => {
  const res = await as(admin, () => request(app).get('/api/payments/funding-sources'))
  assert.equal(res.status, 200, res.text)
  const rows = FundingSource.array().parse(res.body)
  assert.equal(rows[0]?.label, 'Dorado operating')
  assert.equal(rows[0]?.is_default, true)
  const customer = await as({ ...TEST_ACTOR, role: 'user' }, () =>
    request(app).get('/api/payments/funding-sources')
  )
  assert.equal(customer.status, 403, customer.text)
})

test('a payout records its linked account and its funding source on the order', async () => {
  await inOrders(async (c) => {
    const customer = await aUser(c)
    const link = await banks.linkFromPlaid(customer.id, {
      public_token: 'public-sandbox-extras',
      account_id: 'plaid-acct-extras',
      rail: 'ACH',
    })
    const sources = await as(admin, () => request(app).get('/api/payments/funding-sources'))
    const funding_source_id = sources.body[0].id
    const placed = await as(admin, () =>
      request(app)
        .post('/api/orders/admin')
        .send({
          direction: 'purchase',
          user_id: customer.id,
          lots: [],
          payout: { method: 'ACH', bank_link_id: link.id, funding_source_id },
        })
    )
    assert.equal(placed.status, 201, placed.text)
    assert.equal(placed.body.totals?.payout_bank_link_id, link.id)
    assert.equal(placed.body.totals?.payout_funding_source_id, funding_source_id)
    assert.equal(placed.body.payout?.account_last4, link.last_four)
  })
})

test('a refiner order takes its drop-off in the same call, and a note of its own', async () => {
  await inOrders(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      'SELECT id FROM refiners.refiners ORDER BY id LIMIT 1'
    )
    const refiner_id = rows[0]!.id
    const method = await as(admin, () => request(app).get('/api/fulfillments/methods/refiner'))
    const method_id = method.body.find((m: { category: string }) => m.category === 'DROPOFF').id

    await asAdmin(TEST_ACTOR, async () => {
      const made = await request(app)
        .post('/api/refining/orders')
        .send({
          refiner_id,
          direction: 'buy',
          fulfillment: {
            method_id,
            choices: { dropoff: { refiner_id, start_time: '2026-06-18T18:00:00.000Z' } },
          },
        })
      assert.equal(made.status, 201, made.text)
      const { rows: made_rows } = await c.query<{ method_id: string }>(
        'SELECT method_id FROM fulfillments.fulfillments WHERE refining_order_id = $1',
        [made.body.id]
      )
      assert.equal(made_rows[0]?.method_id, method_id)

      const note = await request(app)
        .post('/api/notes')
        .send({ refining_order_id: made.body.id, body: 'Ships Friday' })
      assert.equal(note.status, 201, note.text)
      assert.equal(note.body.refining_order_id, made.body.id)
      const read = await request(app).get('/api/notes').query({ refining_order_id: made.body.id })
      assert.equal(read.body.length, 1)
    })
  })
})
