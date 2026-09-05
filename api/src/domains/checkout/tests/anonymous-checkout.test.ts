import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aProduct, aUser, aVisitor, anAddress, packageId } from '#shared/testing/builders/index.ts'
import { adoptAnonymousCheckout } from '#checkout/adopt.ts'
import * as checkoutService from '#checkout/service.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const HERE = [LOCKS.ORDERS, LOCKS.ADDRESSES]

test('a visitor builds a basket, is refused the two things that need an account, then signs up and keeps it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const visitor = await aVisitor(c)
      const product = await aProduct(c)
      const address = await anAddress(c, visitor)
      const box = await packageId(c, 'Small Box')

      const put = await as(visitor, () =>
        request(app)
          .put('/api/checkout/items')
          .query({ direction: 'purchase' })
          .send({ items: [{ bullion_id: product.id, quantity: 2 }] })
      )
      assert.equal(put.status, 200, put.text)
      assert.equal(put.body.length, 1)

      const row = await as(visitor, () =>
        request(app).get('/api/checkout').query({ direction: 'purchase' })
      )
      assert.equal(row.status, 200, row.text)
      assert.ok(!row.body.missing.includes('items'), 'a basket with lines still owes items')
      assert.ok(row.body.missing.length > 0, 'an unfinished checkout claims to be placeable')

      const draft = await as(visitor, () =>
        request(app).post('/api/fulfillments').send({ checkout_id: row.body.id })
      )
      assert.equal(draft.status, 200, draft.text)
      const fulfillment_id = draft.body.fulfillment.id as string

      const tooEarly = await as(visitor, () =>
        request(app).get(`/api/fulfillments/${fulfillment_id}/rates`)
      )
      assert.equal(tooEarly.status, 422, tooEarly.text)
      assert.match(tooEarly.body?.error?.message ?? '', /choose a package/)

      const patched = await as(visitor, () =>
        request(app)
          .patch(`/api/fulfillments/${fulfillment_id}`)
          .send({
            shipment: { package_id: box, shipper_address_id: address.id },
          })
      )
      assert.equal(patched.status, 200, patched.text)
      for (const step of ['package_id', 'shipper_address_id']) {
        assert.ok(
          !patched.body.missing.includes(step),
          `a visitor who wrote every rate input still owes ${step}`
        )
      }

      const payout = await as(visitor, () =>
        request(app).post('/api/checkout/payout').send({
          direction: 'purchase',
          method: 'ACH',
          account_holder_name: 'A Visitor',
          routing_number: '021000021',
          account_number: '123456789',
          account_type: 'Checking',
        })
      )
      assert.equal(payout.status, 403, payout.text)
      assert.match(payout.body?.error?.message ?? '', /sign in to save a payout account/)

      const placed = await as(visitor, () =>
        request(app).post('/api/orders').send({ checkout_id: row.body.id })
      )
      assert.equal(placed.status, 403, placed.text)
      assert.match(placed.body?.error?.message ?? '', /sign in to place an order/)

      const customer = await aUser(c)
      await adoptAnonymousCheckout(visitor.id, customer.id, c)

      const mine = await as(customer, () =>
        request(app).get('/api/checkout/items').query({ direction: 'purchase' })
      )
      assert.equal(mine.status, 200, mine.text)
      assert.equal(mine.body.length, 1)
      assert.equal(mine.body[0].bullion_id, product.id)
      assert.equal(Number(mine.body[0].quantity), 2)

      const myRow = await as(customer, () =>
        request(app).get('/api/checkout').query({ direction: 'purchase' })
      )
      assert.equal(myRow.status, 200, myRow.text)
      assert.equal(myRow.body.id, row.body.id, 'the same checkout row, re-keyed')
      assert.equal(myRow.body.fulfillment_id, fulfillment_id, 'the draft did not follow')
      const kept = await as(customer, () => request(app).get(`/api/fulfillments/${fulfillment_id}`))
      assert.equal(kept.status, 200, kept.text)
      assert.equal(kept.body.parcel.package_id, box)
      assert.equal(kept.body.parcel.shipper_address_id, address.id)

      await checkoutService.assertRealAccount(customer.id, 'place an order')

      const { rows: left } = await c.query(
        `SELECT 1 FROM checkout.checkouts WHERE user_id = $1
        UNION ALL
       SELECT 1 FROM places.user_addresses WHERE user_id = $1`,
        [visitor.id]
      )
      assert.deepEqual(left, [], "nothing is left hanging off the visitor's id")
    },
    { actor: TEST_ACTOR.id, lock: HERE }
  )
})

test("a visitor's writes are attributed to nobody", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const visitor = await aVisitor(c)
      const product = await aProduct(c)
      const put = await as(visitor, () =>
        request(app)
          .put('/api/checkout/items')
          .query({ direction: 'purchase' })
          .send({ items: [{ bullion_id: product.id, quantity: 1 }] })
      )
      assert.equal(put.status, 200, put.text)

      const { rows } = await c.query(
        `SELECT i.created_by, i.updated_by
         FROM checkout.items i
         JOIN checkout.checkouts ch ON ch.id = i.checkout_id
        WHERE ch.user_id = $1`,
        [visitor.id]
      )
      assert.equal(rows.length, 1)
      assert.equal(rows[0].created_by, null)
      assert.equal(rows[0].updated_by, null)
    },
    { actor: TEST_ACTOR.id, lock: HERE }
  )
})

test('a real customer is still stamped', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c, { name: 'Stamped Person' })
      const product = await aProduct(c)
      const put = await as(customer, () =>
        request(app)
          .put('/api/checkout/items')
          .query({ direction: 'purchase' })
          .send({ items: [{ bullion_id: product.id, quantity: 1 }] })
      )
      assert.equal(put.status, 200, put.text)

      const { rows } = await c.query(
        `SELECT i.created_by
         FROM checkout.items i
         JOIN checkout.checkouts ch ON ch.id = i.checkout_id
        WHERE ch.user_id = $1`,
        [customer.id]
      )
      assert.equal(rows[0].created_by, 'Stamped Person')
    },
    { actor: TEST_ACTOR.id, lock: HERE }
  )
})
