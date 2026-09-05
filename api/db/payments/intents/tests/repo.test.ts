import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as intents from '#db/payments/intents/repo.ts'
import type { PaymentIntentPatch } from '@dorado/contracts'
import * as attempts from '#db/payments/attempts/repo.ts'

let client: PoolClient

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
  client = await pool.connect()
})

afterAll(async () => {
  client.release()
  await pool.end()
})

const anIntent = async (
  c: PoolClient,
  over: Partial<PaymentIntentPatch> = {},
  provider_ref = `pi_${randomUUID().slice(0, 12)}`
) => {
  const intent = await intents.create(
    {
      session_id: over.session_id ?? randomUUID(),
      user_id: over.user_id ?? (await aUser(c)).id,
      type: over.type ?? 'checkout',
      status: over.status ?? 'requires_payment_method',
      amount_expected: over.amount_expected ?? 100,
    },
    c
  )
  await attempts.create(
    {
      id: intent.id,
      intent_id: intent.id,
      provider: 'stripe',
      provider_ref,
      amount: intent.amount_expected,
      status: intent.status,
    },
    c
  )
  return { intent, provider_ref }
}

test('create returns the row it wrote, and getOne reads it back', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = (await aUser(c)).id
    const { intent } = await anIntent(c, { user_id: user, type: 'checkout' })

    assert.equal(intent.user_id, user)
    assert.equal(intent.type, 'checkout')
    assert.equal(Number(intent.amount_expected), 100)

    const read = await intents.getOne(intent.id, c)
    assert.equal(read?.id, intent.id)
    assert.equal(read?.status, 'requires_payment_method')
  })
})

test('update answers true for a real id and writes only the named columns', async () => {
  await inRollback(async (c: PoolClient) => {
    const { intent } = await anIntent(c)

    const changed = await intents.update(intent.id, { status: 'succeeded' }, c)
    assert.equal(changed, true, 'update reported no row changed')

    const after = await intents.getOne(intent.id, c)
    assert.equal(after?.status, 'succeeded')
    assert.equal(Number(after?.amount_expected), 100, 'an unnamed column was overwritten')
  })
})

test('update answers false for an id with no intent row', async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await intents.update(randomUUID(), { status: 'canceled' }, c)
    assert.equal(changed, false, 'update reported a change for an intent that does not exist')
  })
})

test('an update lands on the named intent and no other', async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = await anIntent(c)
    const other = await anIntent(c)

    await intents.update(mine.intent.id, { status: 'succeeded', amount_expected: 250 }, c)

    const untouched = await intents.getOne(other.intent.id, c)
    assert.equal(untouched?.status, 'requires_payment_method')
    assert.equal(Number(untouched?.amount_expected), 100)
  })
})

test('remove answers true once and false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const { intent } = await anIntent(c)
    await attempts.remove(intent.id, c)
    assert.equal(await intents.remove(intent.id, c), true)
    assert.equal(await intents.remove(intent.id, c), false)
  })
})

test('an open intent is found again for the same session, user and type', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = (await aUser(c)).id
    const session_id = randomUUID()
    const { provider_ref } = await anIntent(c, { user_id: user, session_id })

    const found = await intents.findReusable(session_id, user, 'checkout', c)
    assert.equal(found?.attempt?.provider_ref, provider_ref)
    assert.equal(
      (found as unknown as Record<string, unknown>)?.payment_intent_id,
      undefined,
      'the legacy names leaked into the repo'
    )
  })
})

for (const status of ['succeeded', 'processing', 'canceled']) {
  test(`an intent that is ${status} is not offered for reuse`, async () => {
    await inRollback(async (c: PoolClient) => {
      const user = (await aUser(c)).id
      const session_id = randomUUID()
      await anIntent(c, { user_id: user, session_id, status })

      const found = await intents.findReusable(session_id, user, 'checkout', c)
      assert.equal(found, undefined, `a ${status} intent was offered for reuse`)
    })
  })
}

test('an intent for a different type is not reused', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = (await aUser(c)).id
    const session_id = randomUUID()
    await anIntent(c, { user_id: user, session_id, type: 'checkout' })

    const found = await intents.findReusable(session_id, user, 'admin', c)
    assert.equal(found, undefined)
  })
})

test("the payment facts resolve by the provider's reference, in cents", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = (await aUser(c)).id
    const { intent, provider_ref } = await anIntent(c, { user_id: user })

    const facts = await intents.findFactsByRef(provider_ref, c)
    assert.equal(facts?.intent_id, intent.id)
    assert.equal(facts?.attempt_id, intent.id)
    assert.equal(facts?.user_id, user)
    assert.equal(Number(facts?.amount), 10000, 'the facts are not in cents')
    assert.equal(facts?.order_id, null)
    assert.equal(facts?.direction, null)

    assert.equal(await intents.findFactsByRef(`pi_${randomUUID()}`, c), undefined)
  })
})

test("the payment facts carry the attached order's own direction", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'sale' })
    const { provider_ref } = await anIntent(c, { user_id: user.id })
    await intents.update(
      (await intents.findFactsByRef(provider_ref, c))!.intent_id,
      { order_id: order.id },
      c
    )

    const facts = await intents.findFactsByRef(provider_ref, c)
    assert.equal(facts?.order_id, order.id)
    assert.equal(facts?.direction, 'sale')
  })
})

test('a payment write on a client is invisible on another connection', async () => {
  const other = await pool.connect()
  await client.query('BEGIN')
  try {
    const { provider_ref } = await anIntent(client)

    const inside = await client.query('SELECT 1 FROM payments.attempts WHERE provider_ref = $1', [
      provider_ref,
    ])
    assert.equal(inside.rows.length, 1, 'the write did not happen at all')

    const seen = await other.query('SELECT 1 FROM payments.attempts WHERE provider_ref = $1', [
      provider_ref,
    ])
    assert.equal(seen.rows.length, 0, 'an uncommitted payment intent was visible elsewhere')
  } finally {
    await client.query('ROLLBACK')
    other.release()
  }
})
