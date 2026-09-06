import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import * as webhook from '#transactions/webhook.ts'
import * as sweeps from '#transactions/sweeps.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import { settlementCovers } from '#transactions/rules.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import query from '#shared/db/query.ts'

async function aSale(c: PoolClient, user_id: string, owed: number): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO orders.orders (direction, status, number, user_id)
     VALUES ('sale', 'Pending', nextval('orders.sale_number_seq'), $1) RETURNING id`,
    [user_id],
    c
  )
  const id = rows[0]!.id
  await query(
    `INSERT INTO orders.transactions (order_id, post_charges_amount) VALUES ($1, $2)`,
    [id, owed],
    c
  )
  return id
}

async function anIntent(
  c: PoolClient,
  provider_ref: string,
  order_id: string,
  dollars: number,
  status = 'requires_confirmation'
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payments.intents (user_id, type, status, amount_expected, order_id)
     VALUES ((SELECT user_id FROM orders.orders WHERE id = $1), 'sales_order_checkout', $3, $2, $1)
     RETURNING id`,
    [order_id, dollars, status],
    c
  )
  const id = rows[0]!.id
  await query(
    `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
     VALUES ($1, $1, 'stripe', $2, $3, $4)`,
    [id, provider_ref, dollars, status],
    c
  )
  return id
}

const statusOf = async (c: PoolClient, id: string) =>
  (await query<{ status: string }>(`SELECT status FROM orders.orders WHERE id = $1`, [id], c))
    .rows[0]?.status

const silent: typeof webhook.LIVE = {
  retrieve: async () => ({ id: 'unused' }),
  confirm: async () => {},
}

test('settlementCovers refuses a short payment and ignores an order that owes nothing', () => {
  assert.equal(settlementCovers(100, 100), true)
  assert.equal(settlementCovers(99.99, 100), false)
  assert.equal(settlementCovers(100.0049, 100), true)
  assert.equal(settlementCovers(null, 100), false)
  assert.equal(settlementCovers(null, null), true)
  assert.equal(settlementCovers(0, 0), true)
  assert.equal(settlementCovers('250.00', '250.00'), true)
})

test('a webhook that settled LESS than the order owes does not mark it paid', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 500)
      const pi = `pi_short_${Date.now()}`
      await anIntent(c, pi, order, 500)

      await webhook.applyIntentEvent(
        { id: pi, status: 'succeeded', amount: 50000, amount_received: 10000 },
        undefined,
        silent
      )

      assert.equal(
        await statusOf(c, order),
        'Pending',
        'Stripe took $100 against a $500 order and the order was marked paid anyway'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('a webhook that settled the whole total does mark it paid', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 500)
      const pi = `pi_full_${Date.now()}`
      await anIntent(c, pi, order, 500)

      await webhook.applyIntentEvent(
        { id: pi, status: 'succeeded', amount: 50000, amount_received: 50000 },
        undefined,
        silent
      )

      assert.equal(await statusOf(c, order), 'Preparing')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('the settled sweep holds an order Stripe underpaid, and advances one it did not', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const short = await aSale(c, user.id, 500)
      const full = await aSale(c, user.id, 500)
      await anIntent(c, `pi_sweep_short_${Date.now()}`, short, 500, 'succeeded')
      await anIntent(c, `pi_sweep_full_${Date.now()}`, full, 500, 'succeeded')
      await query(
        `INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref)
       SELECT a.id, a.id, $2, 'stripe', a.provider_ref
         FROM payments.attempts a JOIN payments.intents i ON i.id = a.intent_id
        WHERE i.order_id = $1`,
        [short, 100],
        c
      )
      await query(
        `INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref)
       SELECT a.id, a.id, $2, 'stripe', a.provider_ref
         FROM payments.attempts a JOIN payments.intents i ON i.id = a.intent_id
        WHERE i.order_id = $1`,
        [full, 500],
        c
      )

      const results = await sweeps.sweepSettledIntents(c)
      assert.deepEqual(
        results.find((r) => r.order_id === short),
        { order_id: short, outcome: 'held' }
      )
      assert.deepEqual(
        results.find((r) => r.order_id === full),
        { order_id: full, outcome: 'advanced' }
      )
      assert.equal(await statusOf(c, short), 'Pending')
      assert.equal(await statusOf(c, full), 'Preparing')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('the settled sweep does not resurrect an order cancelled between its read and its write', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 500)
      await anIntent(c, `pi_race_${Date.now()}`, order, 500, 'succeeded')
      await query(
        `INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref)
       SELECT a.id, a.id, 500, 'stripe', a.provider_ref
         FROM payments.attempts a JOIN payments.intents i ON i.id = a.intent_id
        WHERE i.order_id = $1`,
        [order],
        c
      )
      await query(`UPDATE orders.orders SET status = 'Cancelled' WHERE id = $1`, [order], c)

      const results = await sweeps.sweepSettledIntents(c)
      assert.equal(
        results.find((r) => r.order_id === order),
        undefined,
        'a cancelled and refunded order was picked up as a candidate'
      )
      assert.equal(await statusOf(c, order), 'Cancelled')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('the advance the sweep writes is guarded, so a row that moved on is a no-op', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 500)
      await query(`UPDATE orders.orders SET status = 'Cancelled' WHERE id = $1`, [order], c)

      const advanced = await ordersRepo.update(
        order,
        { status: 'Preparing' },
        { status: 'Pending' },
        c
      )
      assert.equal(advanced, false, 'the guard the sweep now passes did not hold')
      assert.equal(await statusOf(c, order), 'Cancelled')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('the confirmation is NOT re-sent when one is already recorded as sent', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 500)
      const pi = `pi_mail_sent_${Date.now()}`
      await anIntent(c, pi, order, 500)
      await query(
        `INSERT INTO media.emails (kind, status, to_address, subject, order_id, user_id)
       VALUES ('purchase_order_created', 'sent', $2, 'Your Order Has Been Placed!', $1, $3)`,
        [order, 'someone@dorado.test', user.id],
        c
      )

      let sends = 0
      await webhook.applyIntentEvent(
        { id: pi, status: 'succeeded', amount: 50000, amount_received: 50000 },
        undefined,
        {
          retrieve: async () => ({ id: 'unused' }),
          confirm: async () => {
            sends += 1
          },
        }
      )
      assert.equal(sends, 0, 'the customer was told twice')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test("the confirmation IS sent on the webhook's retry when the first send left no record", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const order = await aSale(c, user.id, 500)
      const pi = `pi_mail_lost_${Date.now()}`
      await anIntent(c, pi, order, 500, 'succeeded')

      let sends = 0
      const counting: typeof webhook.LIVE = {
        retrieve: async () => ({ id: 'unused' }),
        confirm: async () => {
          sends += 1
        },
      }
      await webhook.applyIntentEvent(
        { id: pi, status: 'succeeded', amount: 50000, amount_received: 50000 },
        undefined,
        counting
      )
      assert.equal(
        sends,
        1,
        'the intent was already succeeded before the delivery, which used to make ' +
          'the prior-status guard false and lose the mail for ever'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})
