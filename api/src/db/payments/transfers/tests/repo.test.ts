import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as transfers from '#db/payments/transfers/repo.ts'

beforeAll(() => {
  assert.equal(new Date().getTimezoneOffset(), 0, 'these tests require TZ=UTC')
})
afterAll(async () => {
  await pool.end()
})

async function anOrder(c: PoolClient, user_id: string, total: number): Promise<string> {
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

const payout = (order_id: string, user_id: string) => ({
  order_id,
  refining_order_id: null,
  kind: 'payout' as const,
  rail: 'ACH' as const,
  state: 'Not sent' as const,
  amount: 1200.5,
  counterparty_user_id: user_id,
  details_id: null,
  bank_link_id: null,
  provider: null,
  provider_ref: null,
  reference: 'PO-4242',
  idempotency_key: null,
  override_reason: null,
})

test('opening the same payout twice returns the same row, not a second one', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const order = await anOrder(c, user.id, 1200.5)

      const first = await transfers.create(payout(order, user.id), c)
      const second = await transfers.create(payout(order, user.id), c)
      assert.ok(first)
      assert.equal(second?.id, first?.id)
      assert.equal((await transfers.listForOrder(order, c)).length, 1)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a state guard refuses a write against a state that has already moved', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const order = await anOrder(c, user.id, 1200.5)
      const opened = await transfers.create(payout(order, user.id), c)
      assert.ok(opened)

      assert.equal(
        await transfers.update(opened.id, { state: 'Processing' }, { state: 'Not sent' }, c),
        true
      )
      assert.equal(
        await transfers.update(opened.id, { state: 'Sent' }, { state: 'Not sent' }, c),
        false
      )
      assert.equal((await transfers.getOne(opened.id, c))?.state, 'Processing')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a failed payout leaves room for a fresh attempt on the same order', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const order = await anOrder(c, user.id, 1200.5)
      const first = await transfers.create(payout(order, user.id), c)
      assert.ok(first)
      await transfers.update(first.id, { state: 'Failed' }, {}, c)

      const second = await transfers.create(payout(order, user.id), c)
      assert.ok(second)
      assert.notEqual(second.id, first.id)
      assert.equal((await transfers.getForOrder(order, 'payout', c))?.id, second.id)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a provider reference finds its transfer', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const order = await anOrder(c, user.id, 1200.5)
      const opened = await transfers.create(payout(order, user.id), c)
      assert.ok(opened)
      await transfers.update(opened.id, { provider: 'moov', provider_ref: 'xfer_000001' }, {}, c)
      assert.equal((await transfers.findByProviderRef('moov', 'xfer_000001', c))?.id, opened.id)
      assert.equal(await transfers.findByProviderRef('moov', 'nope', c), undefined)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the payment view answers for an order with no payment row yet', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const order = await anOrder(c, user.id, 1200.5)

      const empty = await transfers.view(order, c)
      assert.equal(empty?.state, null)
      assert.equal(empty?.transfer_id, null)
      assert.equal(Number(empty?.amount_due), 1200.5)

      await transfers.create(payout(order, user.id), c)
      const opened = await transfers.view(order, c)
      assert.equal(opened?.state, 'Not sent')
      assert.equal(opened?.kind, 'payout')
      assert.equal(opened?.reference, 'PO-4242')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the view masks the provider reference rather than printing it', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const order = await anOrder(c, user.id, 1200.5)
      const opened = await transfers.create(payout(order, user.id), c)
      assert.ok(opened)
      await transfers.update(
        opened.id,
        { provider: 'moov', provider_ref: 'xfer_secret_9876' },
        {},
        c
      )
      const view = await transfers.view(order, c)
      assert.equal(view?.provider_ref, '****9876')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the view keeps a Failed row and its reason until a live one replaces it', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const order = await anOrder(c, user.id, 1200.5)
      const first = await transfers.create(payout(order, user.id), c)
      assert.ok(first)
      await transfers.update(first.id, { state: 'Failed', failure_reason: 'R03 no account' }, {}, c)

      const failed = await transfers.view(order, c)
      assert.equal(failed?.state, 'Failed')
      assert.equal(failed?.failure_reason, 'R03 no account')
      assert.equal(failed?.intent_status, null)
      assert.equal(failed?.amount_received, null)

      const second = await transfers.create(payout(order, user.id), c)
      assert.ok(second)
      const live = await transfers.view(order, c)
      assert.equal(live?.transfer_id, second.id)
      assert.equal(live?.state, 'Not sent')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a card sale with no transfer row reads its rail, state and card from the intent', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const { rows: orders } = await query<{ id: string }>(
        `INSERT INTO orders.orders (direction, number, user_id)
         VALUES ('sale', nextval('orders.sale_number_seq'), $1) RETURNING id`,
        [user.id],
        c
      )
      const order = orders[0]!.id
      await query(
        `INSERT INTO orders.transactions (order_id, total, post_charges_amount) VALUES ($1, 250, 250)`,
        [order],
        c
      )
      const { rows: cards } = await query<{ id: string }>(
        `INSERT INTO payments.details (user_id, method_id, last_four, card_brand, provider, provider_ref)
         VALUES ($1, (SELECT id FROM payments.methods WHERE type = 'CARD' LIMIT 1), '4242', 'visa', 'stripe', 'pm_view_test')
         RETURNING id`,
        [user.id],
        c
      )
      const { rows: intents } = await query<{ id: string }>(
        `INSERT INTO payments.intents (user_id, order_id, details_id, amount_expected, status, type)
         VALUES ($1, $2, $3, 250, 'processing', 'sales_order_checkout') RETURNING id`,
        [user.id, order, cards[0]!.id],
        c
      )
      const intent = intents[0]!.id

      const processing = await transfers.view(order, c)
      assert.equal(processing?.transfer_id, null)
      assert.equal(processing?.rail, 'CARD')
      assert.equal(processing?.state, 'Processing')
      assert.equal(processing?.card_brand, 'visa')
      assert.equal(processing?.card_last4, '4242')
      assert.equal(Number(processing?.amount_received), 0)

      const { rows: attempts } = await query<{ id: string }>(
        `INSERT INTO payments.attempts (intent_id, provider, provider_ref, amount, status)
         VALUES ($1, 'stripe', 'pi_view_test', 250, 'succeeded') RETURNING id`,
        [intent],
        c
      )
      await query(
        `INSERT INTO payments.settlements (attempt_id, settled_amount, provider, provider_ref, settled_at)
         VALUES ($1, 250, 'stripe', 'ch_view_test', now())`,
        [attempts[0]!.id],
        c
      )
      const charged = await transfers.view(order, c)
      assert.equal(charged?.state, 'Received')
      assert.equal(Number(charged?.amount_received), 250)

      await query(`UPDATE payments.intents SET status = 'succeeded' WHERE id = $1`, [intent], c)
      const succeeded = await transfers.view(order, c)
      assert.equal(succeeded?.intent_status, 'succeeded')
      assert.equal(succeeded?.state, 'Received')
    },
    { lock: LOCKS.ORDERS }
  )
})
