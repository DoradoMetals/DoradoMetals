import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { idempotencyKeyFor } from '#transactions/rules.ts'
import { paymentIntents as intents } from '#db'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anUnknownId } from '#shared/testing/builders/index.ts'
import { PaymentIntentType, UpdatePaymentIntentBody } from '@dorado/contracts'
import query from '#shared/db/query.ts'

test('the key names the purpose, the subject and the attempt - never the session alone', () => {
  const user = '11111111-1111-1111-1111-111111111111'
  const session = '22222222-2222-2222-2222-222222222222'
  assert.notEqual(
    idempotencyKeyFor('sales_order_checkout', user, session, 0),
    idempotencyKeyFor('sales_order_checkout', user, session, 1),
    'the second checkout in a session reused the first key, and Stripe replays a ' +
      'key for 24 hours, so it got the resolved intent back'
  )
  assert.equal(
    idempotencyKeyFor('sales_order_checkout', user, session, 0),
    idempotencyKeyFor('sales_order_checkout', user, session, 0),
    'a genuine retry of the same attempt must still replay'
  )
  assert.notEqual(
    idempotencyKeyFor('admin', user, session, 0),
    idempotencyKeyFor('sales_order_checkout', user, session, 0)
  )
})

test('the attempt ordinal comes from the intents already recorded, so it moves on', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const session = anUnknownId()
      assert.equal(await intents.countFor(session, user.id, 'sales_order_checkout', c), 0)

      await query(
        `INSERT INTO payments.intents (session_id, user_id, type, status, amount_expected)
         VALUES ($1, $2, 'sales_order_checkout', 'succeeded', 10)`,
        [session, user.id],
        c
      )
      assert.equal(
        await intents.countFor(session, user.id, 'sales_order_checkout', c),
        1,
        'a resolved intent still counts - it is what the old key collided with'
      )
      assert.equal(
        await intents.countFor(session, user.id, 'admin', c),
        0,
        'the count is per purpose'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.USERS] }
  )
})

test('a reusable intent is found by type, and a typeless row cannot silently match', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const session = anUnknownId()
      const { rows } = await query<{ id: string }>(
        `INSERT INTO payments.intents (session_id, user_id, type, status, amount_expected)
         VALUES ($1, $2, 'sales_order_checkout', 'requires_payment_method', 10) RETURNING id`,
        [session, user.id],
        c
      )
      await query(
        `INSERT INTO payments.attempts (id, intent_id, provider, provider_ref, amount, status)
         VALUES ($1, $1, 'stripe', $2, 10, 'requires_payment_method')`,
        [rows[0]!.id, `pi_reuse_${Date.now()}`],
        c
      )

      const found = await intents.findReusable(session, user.id, 'sales_order_checkout', c)
      assert.equal(found?.id, rows[0]!.id)
      assert.equal(
        await intents.findReusable(session, user.id, 'admin', c),
        undefined,
        'an admin intent was reused for a checkout'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.USERS] }
  )
})

test('the contract refuses an intent with no type, so none can be minted at Stripe first', () => {
  assert.equal(PaymentIntentType.safeParse(undefined).success, false)
  assert.equal(PaymentIntentType.safeParse('').success, false)
  assert.equal(PaymentIntentType.safeParse('customer').success, false)
  assert.equal(PaymentIntentType.safeParse('sales_order_checkout').success, true)
  assert.equal(PaymentIntentType.safeParse('admin').success, true)
  assert.equal(UpdatePaymentIntentBody.safeParse({}).success, false)
  assert.equal(UpdatePaymentIntentBody.safeParse({ type: 'sales_order_checkout' }).success, true)
})
