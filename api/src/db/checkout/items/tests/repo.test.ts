import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import type { Direction } from '@dorado/contracts'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aUser, aProduct } from '#shared/testing/builders/index.ts'
import * as checkouts from '#db/checkout/checkouts/repo.ts'
import * as items from '#db/checkout/items/repo.ts'

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

const aSession = async (c: PoolClient, direction: Direction) => {
  const user = await aUser(c)
  const created = await checkouts.create({ user_id: user.id, direction }, c)
  return created!
}

const aMetal = () => 'Gold'

test('a line with no product carries its own values', async () => {
  await inRollback(async (c: PoolClient) => {
    const session = await aSession(c, 'purchase')
    const line = await items.create(
      {
        checkout_id: session.id,
        bullion_id: null,
        metal_id: aMetal(),
        pre_melt: 2.5,
        post_melt: 2.4,
        purity: 0.75,
        content: 1.8,
        unit: 't oz',
        premium: 0.9,
        quantity: 1,
      },
      c
    )
    assert.equal(line.bullion_id, null)

    const [row] = await items.listFor(session.id, c)
    assert.equal(row.id, line.id)
    assert.equal(Number(row.purity), 0.75)
    assert.equal(Number(row.premium), 0.9)
    assert.equal(Number(row.content), 1.8)
    assert.equal(row.unit, 't oz')
  })
})

test('create_from_product snapshots the catalogue row onto the line', async () => {
  await inRollback(async (c: PoolClient) => {
    const session = await aSession(c, 'sale')
    const product = await aProduct(c, {
      display: true,
      gross: 1.0909,
      content: 1,
      purity: 0.9167,
      ask_premium: 1.07,
    })

    const written = await items.createFromProduct(
      session.id,
      { bullion_id: product.id, quantity: 3 },
      c
    )
    assert.ok(written, 'the snapshot wrote no row')
    assert.equal(written.bullion_id, product.id)
    assert.equal(written.metal_id, product.metal_id, 'the line did not inherit the metal')
    assert.equal(Number(written.pre_melt), Number(product.gross))
    assert.equal(Number(written.post_melt), Number(product.content))
    assert.equal(Number(written.purity), Number(product.purity))
    assert.equal(Number(written.content), Number(product.content))
    assert.equal(written.unit, 't oz')
    assert.equal(Number(written.premium), Number(product.ask_premium))
    assert.equal(Number(written.quantity), 3)

    const listed = await items.listFor(session.id, c)
    assert.equal(listed.length, 1)
    assert.equal((await items.listForOrder(session.id, c)).length, 1)
  })
})

test('update writes the named column and answers true; a missing id answers false', async () => {
  await inRollback(async (c: PoolClient) => {
    const session = await aSession(c, 'purchase')
    const line = await items.create(
      {
        checkout_id: session.id,
        bullion_id: null,
        metal_id: aMetal(),
        pre_melt: 2.5,
        purity: 0.75,
        quantity: 1,
      },
      c
    )

    assert.equal(await items.update(line.id, { quantity: 4 }, c), true)
    const after = await items.getOne(line.id, c)
    assert.equal(Number(after?.quantity), 4)
    assert.equal(Number(after?.pre_melt), 2.5, 'an unnamed column was overwritten')

    assert.equal(await items.update(randomUUID(), { quantity: 9 }, c), false)
  })
})

test('removeFor empties one session, and remove answers true once', async () => {
  await inRollback(async (c: PoolClient) => {
    const session = await aSession(c, 'purchase')
    const metal_id = aMetal()
    const first = await items.create(
      { checkout_id: session.id, bullion_id: null, metal_id, quantity: 1 },
      c
    )
    await items.create({ checkout_id: session.id, bullion_id: null, metal_id, quantity: 2 }, c)

    assert.equal(await items.remove(first.id, c), true)
    assert.equal(await items.remove(first.id, c), false)

    assert.equal(await items.removeFor(session.id, c), 1)
    assert.equal((await items.listFor(session.id, c)).length, 0)
  })
})
