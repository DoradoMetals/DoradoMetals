import { test, beforeEach, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as fake from '#providers/moov/fake.ts'
import * as bankLinks from '#db/payments/bank-links/repo.ts'
import * as transfers from '#db/payments/transfers/repo.ts'
import * as payouts from '#transactions/payouts/service.ts'
import * as rails from '#transactions/rails/service.ts'

process.env.MOOV_ACCOUNT_ID = 'acct_platform'
process.env.MOOV_WALLET_PAYMENT_METHOD_ID = 'pm_wallet'

beforeEach(() => fake.reset())
afterAll(async () => {
  await pool.end()
})

async function aPurchase(c: PoolClient, user_id: string, total: number): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders.orders (direction, number, user_id)
     VALUES ('purchase', nextval('orders.purchase_number_seq'), $1) RETURNING id`,
    [user_id],
    c
  )
  const id = rows[0]!.id
  await query(
    `INSERT INTO orders.transactions (order_id, total, post_charges_amount) VALUES ($1, $2, $2)`,
    [id, total],
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
      rail: 'ACH',
      holder_name: 'Test Holder',
      bank_name: 'Test Bank',
      last_four: '4321',
      status: 'verified',
      linked_by: 'plaid',
    },
    c
  )
}

test('a payout runs Not sent -> Processing -> Sent, moved by the row then the webhook', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aPurchase(c, user.id, 1200.5)
      const link = await aVerifiedAccount(c, user.id)

      const opened = await payouts.openPayout({
        order_id: order,
        rail: 'ACH',
        bank_link_id: link.id,
      })
      assert.equal(opened.state, 'Not sent')
      assert.equal(Number(opened.amount), 1200.5)

      const sent = await payouts.sendPayout(opened.id)
      assert.equal(sent.state, 'Processing')
      assert.ok(sent.provider_ref, 'the provider reference was not written back')
      assert.equal(sent.provider, 'moov')
      assert.equal(
        fake.recorded().filter((call) => call.what === 'createTransfer').length,
        1
      )

      fake.advance(sent.provider_ref as string, 'completed')
      const event = fake.eventFor(sent.provider_ref as string, 'completed')
      assert.equal(await rails.applyMoovEvent(event), true)

      const settled = await transfers.getOne(opened.id, c)
      assert.equal(settled?.state, 'Sent')
      assert.ok(settled?.completed_at, 'a settled payout records when it settled')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the same webhook delivered twice moves the payout once', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aPurchase(c, user.id, 300)
      const link = await aVerifiedAccount(c, user.id)
      const opened = await payouts.openPayout({
        order_id: order,
        rail: 'ACH',
        bank_link_id: link.id,
      })
      const sent = await payouts.sendPayout(opened.id)
      const event = fake.eventFor(sent.provider_ref as string, 'completed')

      assert.equal(await rails.applyMoovEvent(event), true)
      assert.equal(await rails.applyMoovEvent(event), false)
      assert.equal((await transfers.getOne(opened.id, c))?.state, 'Sent')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a pending event arriving after the completed one does not undo it', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aPurchase(c, user.id, 300)
      const link = await aVerifiedAccount(c, user.id)
      const opened = await payouts.openPayout({
        order_id: order,
        rail: 'ACH',
        bank_link_id: link.id,
      })
      const sent = await payouts.sendPayout(opened.id)

      await rails.applyMoovEvent(fake.eventFor(sent.provider_ref as string, 'completed'))
      const late = fake.eventFor(sent.provider_ref as string, 'pending')
      assert.equal(await rails.applyMoovEvent(late), false)
      assert.equal((await transfers.getOne(opened.id, c))?.state, 'Sent')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a failed transfer is a state with a reason, not a silence', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aPurchase(c, user.id, 300)
      const link = await aVerifiedAccount(c, user.id)
      const opened = await payouts.openPayout({
        order_id: order,
        rail: 'ACH',
        bank_link_id: link.id,
      })
      const sent = await payouts.sendPayout(opened.id)

      const event = fake.eventFor(sent.provider_ref as string, 'failed', 'R01 insufficient funds')
      assert.equal(await rails.applyMoovEvent(event), true)

      const failed = await transfers.getOne(opened.id, c)
      assert.equal(failed?.state, 'Failed')
      assert.equal(failed?.failure_reason, 'R01 insufficient funds')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a wire is marked Sent by hand and keeps the reference the admin typed', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aPurchase(c, user.id, 40_000)
      const opened = await payouts.openPayout({ order_id: order, rail: 'WIRE' })
      assert.equal(opened.state, 'Not sent')

      const sent = await payouts.markSent(opened.id, 'FEDWIRE-20260906-01')
      assert.equal(sent.state, 'Sent')
      assert.equal(sent.provider, 'manual')
      assert.equal(sent.reference, 'FEDWIRE-20260906-01')
      assert.equal(
        fake.recorded().length,
        0,
        'a wire goes through the bank portal - no provider call belongs to it'
      )
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a payout with no verified account refuses rather than half-sending', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aPurchase(c, user.id, 300)
      const opened = await payouts.openPayout({ order_id: order, rail: 'ACH' })

      await assert.rejects(async () => await payouts.sendPayout(opened.id), /bank account/)
      assert.equal((await transfers.getOne(opened.id, c))?.state, 'Not sent')
      assert.equal(fake.recorded().length, 0)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a payout that is already Processing may not be sent again', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const order = await aPurchase(c, user.id, 300)
      const link = await aVerifiedAccount(c, user.id)
      const opened = await payouts.openPayout({
        order_id: order,
        rail: 'ACH',
        bank_link_id: link.id,
      })
      await payouts.sendPayout(opened.id)

      await assert.rejects(async () => await payouts.sendPayout(opened.id), /Processing/)
      assert.equal(
        fake.recorded().filter((call) => call.what === 'createTransfer').length,
        1
      )
    },
    { lock: LOCKS.ORDERS }
  )
})
