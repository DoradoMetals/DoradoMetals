import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aUser, aCart, anAbsentCartId } from '#shared/testing/builders/index.ts'
import * as checkouts from '#db/checkout/checkouts/repo.ts'
import { CheckoutViewFacts } from '@dorado/contracts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})
afterAll(async () => {
  await pool.end()
})

test('the checkout view parses through CheckoutViewFacts with its basket nested', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const cart = await aCart(c, user, { direction: 'purchase' }).withLots(2)

    const view = await checkouts.view(cart.id, c)
    assert.ok(view, 'the view read nothing back')
    CheckoutViewFacts.parse(view)

    assert.equal(view.id, cart.id)
    assert.equal(view.direction, 'purchase')
    assert.equal(view.items.length, 2, 'the basket did not nest by table')
    assert.deepEqual(
      [...view.items].map((i) => i.checkout_id),
      [cart.id, cart.id],
      'a line from another basket came back'
    )
  })
})

test('an empty basket is an empty array, not a null', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const cart = await aCart(c, user, { direction: 'sale' })

    const view = await checkouts.view(cart.id, c)
    assert.ok(view)
    assert.deepEqual(view.items, [])
  })
})

test('an id nobody owns reads back nothing', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await checkouts.view(anAbsentCartId(), c), undefined)
  })
})
