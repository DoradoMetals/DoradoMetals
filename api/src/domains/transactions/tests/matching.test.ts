import { test, beforeEach, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as plaidFake from '#providers/payments/plaid/fake.ts'
import * as inboundRepo from '#db/payments/inbound/repo.ts'
import * as transfers from '#db/payments/transfers/repo.ts'
import * as charges from '#transactions/charges/service.ts'
import * as matching from '#transactions/inbound/service.ts'

process.env.PLAID_TRUIST_ACCESS_TOKEN = 'access-sandbox-truist'

beforeEach(() => plaidFake.reset())
afterAll(async () => {
  await pool.end()
})

async function aSale(c: PoolClient, user_id: string, owed: number): Promise<[string, number]> {
  const { rows } = await query<{ id: string; number: number }>(
    `INSERT INTO orders.orders (direction, status, number, user_id)
     VALUES ('sale', 'Pending', nextval('orders.sale_number_seq'), $1) RETURNING id, number`,
    [user_id],
    c
  )
  const row = rows[0]!
  await query(
    `INSERT INTO orders.transactions (order_id, total, post_charges_amount) VALUES ($1, $2, $2)`,
    [row.id, owed],
    c
  )
  return [row.id, row.number]
}

test('an admin records a wire and it waits in the unmatched list', async () => {
  await inPinnedTransaction(
    async () => {
      const recorded = await matching.recordWire({
        amount: 41_250,
        occurred_at: '2026-09-06T14:00:00.000Z',
        counterparty_name: 'ACME REFINING LLC',
        memo: 'SETTLEMENT',
        account_ref: 'truist-operating',
      })
      assert.equal(recorded.state, 'Unmatched')
      assert.equal(recorded.source, 'manual')
      assert.ok((await matching.listUnmatched()).some((row) => row.id === recorded.id))
    },
    { lock: LOCKS.ORDERS }
  )
})

test('confirming a match moves the charge to Received and records who matched it', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const [order, number] = await aSale(c, user.id, 900)
      const opened = await charges.openCharge({ order_id: order, rail: 'WIRE' })

      const wire = await matching.recordWire({
        amount: 900,
        occurred_at: '2026-09-06T14:00:00.000Z',
        counterparty_name: 'A Customer',
        memo: `WIRE SO-${number}`,
        account_ref: null,
      })

      const candidates = await matching.candidatesFor(order)
      assert.equal(candidates[0]?.id, wire.id)
      assert.equal(candidates[0]?.rung, 'reference')

      const matched = await matching.confirmMatch(wire.id, order, TEST_ACTOR.id)
      assert.equal(matched.state, 'Matched')
      assert.equal(matched.order_id, order)
      assert.equal(matched.matched_by_id, TEST_ACTOR.id)
      assert.equal((await transfers.getOne(opened.id, c))?.state, 'Received')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a pre-selection never confirms itself', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c, { name: 'Ada Lovelace' })
      const [order] = await aSale(c, user.id, 900)
      await charges.openCharge({ order_id: order, rail: 'ACH' })
      const near = await matching.recordWire({
        amount: 900.25,
        occurred_at: '2026-09-06T14:00:00.000Z',
        counterparty_name: 'Ada Lovelace',
        memo: 'ACH CREDIT',
        account_ref: null,
      })

      const candidates = await matching.candidatesFor(order)
      assert.equal(candidates[0]?.id, near.id)
      assert.equal(candidates[0]?.rung, 'heuristic')
      assert.equal(
        (await inboundRepo.getOne(near.id, c))?.state,
        'Unmatched',
        'the heuristic rung must never auto-confirm'
      )
    },
    { lock: LOCKS.ORDERS }
  )
})

test('unmatching returns the money to the list and the order to owing', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const [order, number] = await aSale(c, user.id, 900)
      const opened = await charges.openCharge({ order_id: order, rail: 'WIRE' })
      const wire = await matching.recordWire({
        amount: 900,
        occurred_at: '2026-09-06T14:00:00.000Z',
        counterparty_name: 'A Customer',
        memo: `SO-${number}`,
        account_ref: null,
      })
      await matching.confirmMatch(wire.id, order, TEST_ACTOR.id)

      const released = await matching.unmatch(wire.id)
      assert.equal(released.state, 'Unmatched')
      assert.equal(released.order_id, null)
      assert.equal((await transfers.getOne(opened.id, c))?.state, 'Due')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a matched row cannot be matched to a second order', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const [first] = await aSale(c, user.id, 900)
      const [second] = await aSale(c, user.id, 900)
      const wire = await matching.recordWire({
        amount: 900,
        occurred_at: '2026-09-06T14:00:00.000Z',
        counterparty_name: 'A Customer',
        memo: 'WIRE',
        account_ref: null,
      })
      await matching.confirmMatch(wire.id, first, TEST_ACTOR.id)

      await assert.rejects(
        async () => await matching.confirmMatch(wire.id, second, TEST_ACTOR.id),
        /already Matched/
      )
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the Truist feed becomes inbound rows a match ladder can reach', async () => {
  await inPinnedTransaction(
    async (c) => {
      const user = await aUser(c)
      const [order, number] = await aSale(c, user.id, 1500)
      plaidFake.feed([
        {
          transaction_id: 'txn-credit',
          amount: -1500,
          date: '2026-09-06',
          name: `ACH CREDIT SO-${number}`,
          merchant_name: null,
          pending: false,
          account_id: 'truist-1',
        },
        {
          transaction_id: 'txn-debit',
          amount: 42,
          date: '2026-09-06',
          name: 'CARD PURCHASE',
          merchant_name: null,
          pending: false,
          account_id: 'truist-1',
        },
        {
          transaction_id: 'txn-pending',
          amount: -99,
          date: '2026-09-06',
          name: 'PENDING CREDIT',
          merchant_name: null,
          pending: true,
          account_id: 'truist-1',
        },
      ])

      assert.equal(await matching.syncFeed(), 1, 'only settled credits become inbound rows')

      const candidates = await matching.candidatesFor(order)
      assert.equal(candidates[0]?.rung, 'reference')
      assert.equal(Number(candidates[0]?.amount), 1500)
      assert.equal(candidates[0]?.source, 'plaid')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the feed cursor advances so the second sync does not re-read the first page', async () => {
  await inPinnedTransaction(
    async () => {
      plaidFake.feed([
        {
          transaction_id: 'txn-once',
          amount: -10,
          date: '2026-09-06',
          name: 'ACH CREDIT',
          merchant_name: null,
          pending: false,
          account_id: 'truist-1',
        },
      ])
      assert.equal(await matching.syncFeed(), 1)
      assert.equal(await matching.syncFeed(), 0)
      assert.equal(
        plaidFake.recorded().filter((call) => call.what === 'syncTransactions').length,
        2
      )
    },
    { lock: LOCKS.ORDERS }
  )
})
