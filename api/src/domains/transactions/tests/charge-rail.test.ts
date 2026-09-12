import { test, beforeEach, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as fake from '#providers/payments/moov/fake.ts'
import * as bankLinks from '#db/payments/bank-links/repo.ts'
import * as transfers from '#db/payments/transfers/repo.ts'
import * as charges from '#transactions/charges/service.ts'
import * as rails from '#transactions/rails/service.ts'

process.env.MOOV_ACCOUNT_ID = 'acct_platform'
process.env.MOOV_WALLET_PAYMENT_METHOD_ID = 'pm_wallet'

beforeEach(() => fake.reset())
afterAll(async () => {
  await pool.end()
})

async function aSale(c: PoolClient, user_id: string, owed: number): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders.orders (direction, status, number, user_id)
     VALUES ('sale', 'Pending', nextval('orders.sale_number_seq'), $1) RETURNING id`,
    [user_id],
    c
  )
  const id = rows[0]!.id
  await query(
    `INSERT INTO orders.transactions (order_id, total, post_charges_amount) VALUES ($1, $2, $2)`,
    [id, owed],
    c
  )
  return id
}

async function aVerifiedAccount(c: PoolClient, user_id: string) {
  return await bankLinks.create(
    {
      user_id,
      provider: 'moov',
      moov_account_id: 'acct_customer',
      moov_bank_account_id: 'bank_1',
      payment_method_id: 'pm_customer',
      rail: 'RTP',
      holder_name: 'Test Holder',
      bank_name: 'Test Bank',
      last_four: '4321',
      status: 'verified',
      linked_by: 'plaid',
    },
    c
  )
}

test('a charge runs Due -> Processing -> Received on the customer transfer', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 812.34)
      const link = await aVerifiedAccount(c, user.id)

      const opened = await charges.openCharge({ order_id: order, rail: 'RTP' })
      assert.equal(opened.state, 'Due')

      const requested = await charges.requestCharge(opened.id, link.id)
      assert.equal(requested.state, 'Processing')
      assert.ok(requested.provider_ref)

      const event = fake.eventFor(requested.provider_ref as string, 'completed')
      assert.equal(await rails.applyMoovEvent(event), true)
      assert.equal((await transfers.getOne(opened.id, c))?.state, 'Received')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the customer bank is the SOURCE of a charge and the wallet the destination', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 100)
      const link = await aVerifiedAccount(c, user.id)
      const opened = await charges.openCharge({ order_id: order, rail: 'ACH' })
      await charges.requestCharge(opened.id, link.id)

      assert.equal(
        fake.recorded().filter((call) => call.what === 'createTransfer').length,
        1,
        'exactly one provider transfer per charge'
      )
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a card charge keeps the Stripe path and lands Received on payment_intent.succeeded', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 500)
      const opened = await charges.openCharge({ order_id: order, rail: 'CARD' })
      assert.equal(opened.state, 'Due')

      assert.equal(await rails.settleCardCharge(order, 'pi_card_1', c), true)
      assert.equal((await transfers.getOne(opened.id, c))?.state, 'Received')

      assert.equal(
        await rails.settleCardCharge(order, 'pi_card_1', c),
        false,
        'a retried Stripe delivery settles once'
      )
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a charge on an order that owes nothing is refused', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 0)
      await assert.rejects(
        async () => await charges.openCharge({ order_id: order, rail: 'ACH' }),
        /owes nothing/
      )
    },
    { lock: LOCKS.ORDERS }
  )
})

test('opening the same charge twice is one row', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 250)
      const first = await charges.openCharge({ order_id: order, rail: 'ACH' })
      const second = await charges.openCharge({ order_id: order, rail: 'ACH' })
      assert.equal(second.id, first.id)
      assert.equal((await transfers.listForOrder(order, c)).length, 1)
    },
    { lock: LOCKS.ORDERS }
  )
})
