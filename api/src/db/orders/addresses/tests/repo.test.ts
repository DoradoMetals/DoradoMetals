import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS, takeLocks } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anAddress, anOrder } from '#shared/testing/builders/index.ts'
import * as addresses from '#db/orders/addresses/repo.ts'

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

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

const anOrderAndTwoAddresses = async (c: PoolClient) => {
  const user = await aUser(c)
  const order = await anOrder(c, user, { direction: 'purchase' })
  const first = await anAddress(c, user, { city: 'Dallas' })
  const second = await anAddress(c, user, { city: 'Fresno', default_shipping: false })
  return { order_id: order.id, books: [first, second] }
}

test('a second link for the same order corrects the first rather than adding one', async () => {
  await inRollback(async (c: PoolClient) => {
    const { order_id, books } = await anOrderAndTwoAddresses(c)

    assert.equal(
      await addresses.create(
        { order_id, address_id: books[0].id, source_address_id: books[0].id },
        c
      ),
      true
    )
    assert.equal(
      await addresses.create(
        { order_id, address_id: books[1].id, source_address_id: books[1].id },
        c
      ),
      true
    )

    const { rows } = await c.query('SELECT address_id FROM orders.addresses WHERE order_id = $1', [
      order_id,
    ])
    assert.equal(rows.length, 1, 'the second link added a row instead of correcting the first')
    assert.equal(rows[0].address_id, books[1].id, 'the correction did not land')
  })
})

test('getFor reads the link back and getMany batches it', async () => {
  await inRollback(async (c: PoolClient) => {
    const { order_id, books } = await anOrderAndTwoAddresses(c)

    await addresses.create({ order_id, address_id: books[0].id, source_address_id: books[0].id }, c)

    const one = await addresses.getFor(order_id, c)
    assert.equal(one?.address_id, books[0].id)
    assert.equal(one?.source_address_id, books[0].id)

    const many = await addresses.getMany([order_id], c)
    assert.equal(many.length, 1)
    assert.equal(many[0].order_id, order_id)

    assert.deepEqual(await addresses.getMany([], c), [])
  })
})
