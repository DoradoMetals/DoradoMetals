import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import {
  aHandover,
  aProduct,
  aUser,
  aVisitor,
  anAddress,
  paymentMethodId,
  saleServiceId,
} from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const asCaller = (u: { id: string; name: string | null; email: string | null }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: 'user',
})

async function aReadySaleCheckout(
  c: PoolClient,
  buyer: { id: string; name: string | null; email: string | null }
): Promise<string> {
  const address = await anAddress(c, buyer)
  const product = await aProduct(c, { metal_id: 'Gold', content: 0.001, ask_premium: 1 })

  const basket = await as(buyer, () =>
    request(app)
      .put('/api/checkout/items')
      .query({ direction: 'sale' })
      .send({
        items: [{ bullion_id: product.id, quantity: 1 }],
      })
  )
  assert.equal(basket.status, 200, basket.text)

  const carrier_service_id = await saleServiceId(c)
  const payment_method_id = await paymentMethodId(c, 'CARD', 'sale')
  const patched = await as(buyer, () =>
    request(app).patch('/api/checkout').send({
      direction: 'sale',
      recipient_address_id: address.id,
      payment_method_id,
    })
  )
  assert.equal(patched.status, 200, patched.text)
  await aHandover(c, patched.body.id, {
    direction: 'sale',
    method: 'DROPSHIP',
    choices: { shipment: { carrier_service_id } },
  })
  return patched.body.id as string
}

test('a signed-in customer places their own sale order', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const buyer = asCaller(await aUser(c, { funds: 1_000_000 }))
      const checkout_id = await aReadySaleCheckout(c, buyer)

      const placed = await as(buyer, () => request(app).post('/api/orders').send({ checkout_id }))

      assert.equal(placed.status, 201, placed.text)
      assert.equal(placed.body.order.direction, 'sale')
      assert.equal(placed.body.order.user_id, buyer.id, 'the order belongs to somebody else')
      assert.equal(placed.body.items.length, 1)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test("a customer cannot place another customer's checkout", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = asCaller(await aUser(c, { funds: 1_000_000 }))
      const stranger = asCaller(await aUser(c, { funds: 1_000_000 }))
      const checkout_id = await aReadySaleCheckout(c, owner)

      const placed = await as(stranger, () =>
        request(app).post('/api/orders').send({ checkout_id })
      )

      assert.equal(placed.status, 403, placed.text)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('a visitor may shop and may not buy', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const visitor = asCaller(await aVisitor(c, { funds: 1_000_000 }))
      const checkout_id = await aReadySaleCheckout(c, visitor)

      const placed = await as(visitor, () => request(app).post('/api/orders').send({ checkout_id }))

      assert.equal(placed.status, 403, placed.text)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})
