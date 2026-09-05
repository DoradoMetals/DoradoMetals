import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import * as service from '#payments/service.ts'
import * as webhook from '#payments/webhook.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import query from '#shared/db/query.ts'

const READ = `SELECT i.status, i.amount_expected, st.settled_amount
                FROM payments.intents i
                JOIN payments.attempts a ON a.intent_id = i.id
                LEFT JOIN payments.settlements st ON st.attempt_id = a.id
               WHERE a.provider_ref = $1`

async function seedSettledIntent(c: PoolClient, provider_ref: string) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payments.intents (type, status, amount_expected)
     VALUES ('order', 'succeeded', 51.78) RETURNING id`,
    [],
    c
  )
  await query(
    `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
     VALUES ($1, $1, 'stripe', $2, 51.78, 'succeeded')`,
    [rows[0]!.id, provider_ref],
    c
  )
  await query(
    `INSERT INTO payments.settlements (id, attempt_id, settled_amount, provider, provider_ref, settled_at)
     VALUES ($1, $1, 51.78, 'stripe', $2, now())`,
    [rows[0]!.id, provider_ref],
    c
  )
}

test('a charge.* webhook updates nothing, because a charge is not an intent', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const id = `pi_test_charge_${Date.now()}`
      await seedSettledIntent(c, id)

      const charge = {
        id: `ch_test_${Date.now()}`,
        status: 'succeeded',
        amount: 5178,
      }
      const matched = await service.updateFromProvider(charge, c)
      assert.equal(matched, false, 'a charge id matched an intent')

      const { rows } = await query(READ, [id], c)
      assert.equal(rows.length, 1)
      assert.equal(rows[0].status, 'succeeded', 'unchanged')
      assert.equal(Number(rows[0].settled_amount), 51.78, 'unchanged')

      const { rows: byChargeId } = await query(READ, [charge.id], c)
      assert.equal(byChargeId.length, 0, 'no row is created for a charge id')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('a webhook for an intent with no row writes nothing, and says so', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const before = await query(`SELECT count(*)::int AS n FROM payments.intents`, [], c)

      const matched = await service.updateFromProvider(
        {
          id: `pi_test_absent_${Date.now()}`,
          status: 'succeeded',
          amount: 11480,
          amount_received: 11480,
        },
        c
      )

      const after = await query(`SELECT count(*)::int AS n FROM payments.intents`, [], c)
      assert.equal(after.rows[0].n, before.rows[0].n, 'no row inserted - it is an UPDATE')

      assert.equal(matched, false, 'nothing reported that no row matched')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('the service refuses a webhook that matches no intent, so Stripe retries', async () => {
  await inPinnedTransaction(
    async () => {
      await assert.rejects(
        () =>
          webhook.applyIntentEvent({
            id: `pi_test_absent_${Date.now()}`,
            status: 'succeeded',
            amount: 11480,
            amount_received: 11480,
          }),
        (err: unknown) => {
          const e = err as { statusCode?: number; kind?: string; message?: string; code?: string }
          assert.equal(e.statusCode, undefined, 'a fault must not carry a deliberate status')
          assert.equal(e.kind, undefined, 'a fault is not a domain refusal')
          assert.match(String(e.message), /no payment intent row/)
          return true
        }
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('the service accepts a webhook that matches an intent', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const id = `pi_test_matched_${Date.now()}`
      await seedSettledIntent(c, id)

      await webhook.applyIntentEvent({
        id,
        status: 'succeeded',
        amount: 11480,
        amount_received: 11480,
      })

      const { rows } = await query(READ, [id], c)
      assert.equal(Number(rows[0].amount_expected), 114.8, 'the update did not land')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('a late payment_failed overwrites a settled intent, and Stripe does not guarantee order', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const id = `pi_test_order_${Date.now()}`
      await seedSettledIntent(c, id)

      await service.updateFromProvider(
        {
          id,
          status: 'requires_payment_method',
          amount: 5178,
          amount_received: 0,
        },
        c
      )

      const { rows } = await query(READ, [id], c)
      assert.equal(rows[0].status, 'requires_payment_method')
      assert.equal(Number(rows[0].settled_amount), 51.78, 'the settlement is a durable fact')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})
