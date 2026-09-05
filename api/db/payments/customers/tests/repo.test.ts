import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as customers from '#db/payments/customers/repo.ts'

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

test("the billing identity comes back with the provider's id for the customer", async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)

    const row = await customers.getOne(user.id, c)
    assert.equal(row?.id, user.id)
    assert.ok('stripeCustomerId' in (row ?? {}), "the provider's customer id is not projected")
  })
})

test('update sets the customer id on that user alone, and answers true', async () => {
  await inRollback(async (c: PoolClient) => {
    const target = (await aUser(c)).id
    const bystander = (await aUser(c)).id
    const before = (await customers.getOne(bystander, c))?.stripeCustomerId ?? null

    const customerId = `cus_${randomUUID().slice(0, 10)}`
    assert.equal(
      await customers.update(target, { [customers.STRIPE_CUSTOMER]: customerId }, c),
      true
    )

    assert.equal((await customers.getOne(target, c))?.stripeCustomerId, customerId)
    assert.equal(
      (await customers.getOne(bystander, c))?.stripeCustomerId ?? null,
      before,
      "another user's Stripe customer was changed"
    )
  })
})

test('update answers false for an id with no user row', async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await customers.update(
      randomUUID(),
      { [customers.STRIPE_CUSTOMER]: 'cus_nobody' },
      c
    )
    assert.equal(changed, false, 'update reported a change for a user that does not exist')
  })
})
