import { test, beforeEach, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anUnknownId } from '#shared/testing/builders/index.ts'
import * as moovFake from '#providers/moov/fake.ts'
import * as plaidFake from '#providers/plaid/fake.ts'
import * as bankLinks from '#db/payments/bank-links/repo.ts'

process.env.MOOV_ACCOUNT_ID = 'acct_platform'
process.env.MOOV_WALLET_PAYMENT_METHOD_ID = 'pm_wallet'
process.env.PLAID_TRUIST_ACCESS_TOKEN = 'access-sandbox-truist'

await mockSessions()
const { default: app } = await import('#app')

beforeEach(() => {
  moovFake.reset()
  plaidFake.reset()
})
afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const admin = { id: TEST_ACTOR.id, name: 'Admin', email: 'admin@dorado.test', role: 'admin' }
const asAdmin = <T>(fn: () => Promise<T>) => as(admin, fn, 'admin')

async function anOrderOf(
  c: PoolClient,
  direction: string,
  user_id: string,
  total: number
): Promise<[string, number]> {
  const sequence = direction === 'sale' ? 'orders.sale_number_seq' : 'orders.purchase_number_seq'
  const { rows } = await query<{ id: string; number: number }>(
    `INSERT INTO orders.orders (direction, status, number, user_id)
     VALUES ($1::orders.direction, 'Pending', nextval('${sequence}'), $2) RETURNING id, number`,
    [direction, user_id],
    c
  )
  const row = rows[0]!
  await query(
    `INSERT INTO orders.transactions (order_id, total, post_charges_amount) VALUES ($1, $2, $2)`,
    [row.id, total],
    c
  )
  return [row.id, row.number]
}

const aVerifiedAccount = (c: PoolClient, user_id: string) =>
  bankLinks.create(
    {
      user_id,
      provider: 'moov',
      moov_account_id: 'acct_customer',
      moov_bank_account_id: 'bank_1',
      payment_method_id: 'pm_customer',
      rail: 'ACH',
      holder_name: 'Test Holder',
      bank_name: 'Test Bank',
      last_four: '4321',
      status: 'verified',
      linked_by: 'plaid',
    },
    c
  )

test('an admin opens, sends and settles a payout over HTTP', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      const [order] = await anOrderOf(c, 'purchase', customer.id, 750)
      const link = await aVerifiedAccount(c, customer.id)

      const opened = await asAdmin(() =>
        request(app)
          .post('/api/payments/payouts')
          .send({ order_id: order, rail: 'ACH', bank_link_id: link.id })
      )
      assert.equal(opened.status, 201, opened.text)
      assert.equal(opened.body.state, 'Not sent')

      const read = await asAdmin(() => request(app).get(`/api/payments/payouts/${opened.body.id}`))
      assert.equal(read.status, 200, read.text)
      assert.equal(read.body.kind, 'payout')

      const sent = await asAdmin(() =>
        request(app).post(`/api/payments/payouts/${opened.body.id}/send`).send({})
      )
      assert.equal(sent.status, 200, sent.text)
      assert.equal(sent.body.state, 'Processing')

      const view = await asAdmin(() => request(app).get(`/api/payments/view/${order}`))
      assert.equal(view.status, 200, view.text)
      assert.equal(view.body.state, 'Processing')
      assert.equal(view.body.pay_to.last_four, '4321')
      assert.equal(Number(view.body.amount_due), 750)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('an admin marks a wire Sent and fails a payout with a reason', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      const [wireOrder] = await anOrderOf(c, 'purchase', customer.id, 60_000)
      const wire = await asAdmin(() =>
        request(app).post('/api/payments/payouts').send({ order_id: wireOrder, rail: 'WIRE' })
      )
      const marked = await asAdmin(() =>
        request(app)
          .post(`/api/payments/payouts/${wire.body.id}/mark_sent`)
          .send({ reference: 'FEDWIRE-1' })
      )
      assert.equal(marked.status, 200, marked.text)
      assert.equal(marked.body.state, 'Sent')

      const [failOrder] = await anOrderOf(c, 'purchase', customer.id, 100)
      const opened = await asAdmin(() =>
        request(app).post('/api/payments/payouts').send({ order_id: failOrder, rail: 'ACH' })
      )
      const failed = await asAdmin(() =>
        request(app)
          .post(`/api/payments/payouts/${opened.body.id}/fail`)
          .send({ reason: 'the customer closed the account' })
      )
      assert.equal(failed.status, 200, failed.text)
      assert.equal(failed.body.state, 'Failed')
      assert.equal(failed.body.failure_reason, 'the customer closed the account')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the Pay to select answers for the customer it names', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      await aVerifiedAccount(c, customer.id)

      const listed = await asAdmin(() =>
        request(app).get(`/api/payments/payouts/pay_to?user_id=${customer.id}`)
      )
      assert.equal(listed.status, 200, listed.text)
      assert.equal(listed.body.length, 1)
      assert.equal(listed.body[0].payment_method_id, 'pm_customer')

      const missing = await asAdmin(() => request(app).get('/api/payments/payouts/pay_to'))
      assert.equal(missing.status, 400)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('an admin opens, requests and fails a charge over HTTP', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      const [order] = await anOrderOf(c, 'sale', customer.id, 320)
      const link = await aVerifiedAccount(c, customer.id)

      const opened = await asAdmin(() =>
        request(app).post('/api/payments/charges').send({ order_id: order, rail: 'RTP' })
      )
      assert.equal(opened.status, 201, opened.text)
      assert.equal(opened.body.state, 'Due')

      const read = await asAdmin(() => request(app).get(`/api/payments/charges/${opened.body.id}`))
      assert.equal(read.status, 200, read.text)

      const requested = await asAdmin(() =>
        request(app)
          .post(`/api/payments/charges/${opened.body.id}/request`)
          .send({ bank_link_id: link.id })
      )
      assert.equal(requested.status, 200, requested.text)
      assert.equal(requested.body.state, 'Processing')

      const failed = await asAdmin(() =>
        request(app)
          .post(`/api/payments/charges/${opened.body.id}/fail`)
          .send({ reason: 'R01 insufficient funds' })
      )
      assert.equal(failed.status, 200, failed.text)
      assert.equal(failed.body.state, 'Failed')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the matching surface lists, pre-selects, confirms and releases over HTTP', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      const [order, number] = await anOrderOf(c, 'sale', customer.id, 1000)
      await asAdmin(() =>
        request(app).post('/api/payments/charges').send({ order_id: order, rail: 'WIRE' })
      )

      const recorded = await asAdmin(() =>
        request(app).post('/api/payments/inbound/wire').send({
          amount: 1000,
          occurred_at: '2026-09-06T10:00:00.000Z',
          counterparty_name: 'ACME REFINING LLC',
          memo: `WIRE SO-${number}`,
          account_ref: null,
        })
      )
      assert.equal(recorded.status, 201, recorded.text)

      const unmatched = await asAdmin(() => request(app).get('/api/payments/inbound/unmatched'))
      assert.equal(unmatched.status, 200, unmatched.text)
      assert.ok(unmatched.body.some((row: { id: string }) => row.id === recorded.body.id))

      const candidates = await asAdmin(() =>
        request(app).get(`/api/payments/inbound/candidates?order_id=${order}`)
      )
      assert.equal(candidates.status, 200, candidates.text)
      assert.equal(candidates.body[0].rung, 'reference')

      const matched = await asAdmin(() =>
        request(app).post(`/api/payments/inbound/${recorded.body.id}/match`).send({ order_id: order })
      )
      assert.equal(matched.status, 200, matched.text)
      assert.equal(matched.body.state, 'Matched')

      const view = await asAdmin(() => request(app).get(`/api/payments/view/${order}`))
      assert.equal(view.body.state, 'Received')

      const released = await asAdmin(() =>
        request(app).post(`/api/payments/inbound/${recorded.body.id}/unmatch`).send({})
      )
      assert.equal(released.status, 200, released.text)
      assert.equal(released.body.state, 'Unmatched')

      const missing = await asAdmin(() => request(app).get('/api/payments/inbound/candidates'))
      assert.equal(missing.status, 400)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the Truist feed is pulled over HTTP', async () => {
  await inPinnedTransaction(
    async () => {
      plaidFake.feed([
        {
          transaction_id: 'txn-http',
          amount: -25,
          date: '2026-09-06',
          name: 'ACH CREDIT',
          merchant_name: null,
          pending: false,
          account_id: 'truist-1',
        },
      ])
      const synced = await asAdmin(() => request(app).post('/api/payments/inbound/sync').send({}))
      assert.equal(synced.status, 200, synced.text)
      assert.equal(synced.body, 1)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a customer links a bank, lists it, and verifies micro deposits over HTTP', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      const caller = { id: customer.id, name: customer.name, email: customer.email, role: 'user' }

      const token = await as(caller, () =>
        request(app).post('/api/payments/banks/link_token').send({})
      )
      assert.equal(token.status, 200, token.text)
      assert.ok(token.body.link_token)

      const linked = await as(caller, () =>
        request(app)
          .post('/api/payments/banks/link')
          .send({ public_token: 'public-sandbox-1', account_id: 'plaid-1', rail: 'ACH' })
      )
      assert.equal(linked.status, 201, linked.text)
      assert.equal(linked.body.linked_by, 'plaid')

      const pending = await as(caller, () =>
        request(app).post('/api/payments/banks/micro_deposits').send({
          holder_name: 'Test Holder',
          account_type: 'checking',
          routing_number: '021000021',
          account_number: '000123456789',
          rail: 'ACH',
        })
      )
      assert.equal(pending.status, 201, pending.text)
      assert.equal(pending.body.status, 'pending')

      const verified = await as(caller, () =>
        request(app).post(`/api/payments/banks/${pending.body.id}/verify`).send({ amounts: [12, 34] })
      )
      assert.equal(verified.status, 200, verified.text)
      assert.equal(verified.body.status, 'verified')

      const listed = await as(caller, () => request(app).get('/api/payments/banks'))
      assert.equal(listed.status, 200, listed.text)
      assert.equal(listed.body.length, 2)
    },
    { lock: LOCKS.USERS }
  )
})

test('only an admin may mint a link token for somebody else', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      const stranger = await aUser(c)
      const caller = { id: customer.id, name: customer.name, email: customer.email, role: 'user' }

      const refused = await as(caller, () =>
        request(app).post('/api/payments/banks/link_token').send({ user_id: stranger.id })
      )
      assert.equal(refused.status, 403, refused.text)

      const allowed = await asAdmin(() =>
        request(app).post('/api/payments/banks/link_token').send({ user_id: stranger.id })
      )
      assert.equal(allowed.status, 200, allowed.text)
    },
    { lock: LOCKS.USERS }
  )
})

test("an admin records a refiner's vaulted account without any number of ours", async () => {
  await inPinnedTransaction(
    async (c) => {
      const refiner = await aUser(c)
      const recorded = await asAdmin(() =>
        request(app).post('/api/payments/banks/vaulted').send({
          user_id: refiner.id,
          moov_account_id: 'acct_refiner',
          payment_method_id: 'pm_refiner',
        })
      )
      assert.equal(recorded.status, 201, recorded.text)
      assert.equal(recorded.body.linked_by, 'vendor_form')
      assert.equal(recorded.body.status, 'verified')
      assert.equal(recorded.body.last_four, null)
    },
    { lock: LOCKS.USERS }
  )
})

test('a payment view for an order nobody has is a 404, not an empty card', async () => {
  await inPinnedTransaction(
    async () => {
      const res = await asAdmin(() => request(app).get(`/api/payments/view/${anUnknownId()}`))
      assert.equal(res.status, 404, res.text)
    },
    { lock: LOCKS.ORDERS }
  )
})
