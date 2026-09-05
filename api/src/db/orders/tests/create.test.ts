import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS, takeLocks } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as orders from '#db/orders/repo.ts'
import * as checkouts from '#db/checkout/checkouts/repo.ts'
import type { Direction } from '@dorado/contracts'

async function aCheckoutId(
  c: PoolClient,
  user_id: string,
  direction: Direction = 'purchase'
): Promise<string> {
  const created = await checkouts.create({ user_id, direction }, c)
  if (!created) throw new Error('checkout.checkouts refused a new session')
  return created.id
}

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

test('a new order lands with its direction, status and number, copied from its checkout', async () => {
  await inRollback(async (c: PoolClient) => {
    const user_id = (await aUser(c)).id
    const checkout_id = await aCheckoutId(c, user_id, 'purchase')

    const created = await orders.createForCheckout(checkout_id, 'Pending', c)
    assert.ok(created, 'the order was not written')
    const { id, number, user_id: owner } = created!

    const row = await orders.getOne(id, c)
    assert.ok(row, 'the order was not written')
    assert.equal(owner, user_id, 'the owner was not copied from the checkout')
    assert.equal(row!.direction, 'purchase', 'the order was not created as a purchase')
    assert.equal(row!.status, 'Pending')
    assert.ok(Number(number) > 0, 'the order drew no number from the sequence')
    assert.equal(Number(row!.number), Number(number))
  })
})

test('each direction draws from its own sequence, and each draw advances it', async () => {
  await inRollback(async (c: PoolClient) => {
    const user_id = (await aUser(c)).id
    const purchase_checkout_id = await aCheckoutId(c, user_id, 'purchase')

    const first = await orders.createForCheckout(purchase_checkout_id, 'Pending', c)
    const second = await orders.createForCheckout(purchase_checkout_id, 'Pending', c)
    assert.ok(
      Number(second!.number) > Number(first!.number),
      'the sequence did not advance between two creates'
    )

    const sale_checkout_id = await aCheckoutId(c, user_id, 'sale')
    const sale = await orders.createForCheckout(sale_checkout_id, 'Pending', c)
    const { rows } = await c.query(`SELECT direction FROM orders.orders WHERE id = $1`, [sale!.id])
    assert.equal(rows[0].direction, 'sale')
  })
})

test('a new order starts with its spots unpinned', async () => {
  await inRollback(async (c: PoolClient) => {
    const user_id = (await aUser(c)).id
    const checkout_id = await aCheckoutId(c, user_id, 'purchase')

    const created = await orders.createForCheckout(checkout_id, 'Pending', c)

    const { rows } = await c.query('SELECT spots_locked FROM orders.orders WHERE id = $1', [
      created!.id,
    ])
    assert.equal(rows[0].spots_locked, false, 'a new order should start with its spots unpinned')
  })
})

test('rolling back undoes the order', async () => {
  const outside = await pool.connect()
  const writer = await pool.connect()
  try {
    await writer.query('BEGIN')
    const checkout_id = await aCheckoutId(writer, TEST_ACTOR.id, 'purchase')
    const created = await orders.createForCheckout(checkout_id, 'Pending', writer)
    const { id } = created!
    await writer.query('ROLLBACK')

    const { rows } = await outside.query('SELECT id FROM orders.orders WHERE id = $1', [id])
    assert.equal(rows.length, 0, 'orders.orders kept a row from a rolled-back creation')
  } finally {
    outside.release()
    writer.release()
  }
})
