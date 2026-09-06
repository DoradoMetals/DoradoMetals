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
    `INSERT INTO orders.orders (direction, status, number, user_id)
     VALUES ('purchase', 'Pending', nextval('orders.purchase_number_seq'), $1) RETURNING id`,
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
      await transfers.update(
        opened.id,
        { provider: 'moov', provider_ref: 'xfer_000001' },
        {},
        c
      )
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
