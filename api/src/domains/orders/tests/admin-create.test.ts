import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import {
  aProduct,
  aUser,
  anAddress,
  fulfillmentMethodId,
  paymentMethodId,
  saleServiceId,
} from '#shared/testing/builders/index.ts'
import { closeBrowser } from '#providers/pdfs/puppeteer.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await closeBrowser()
  await pool.end()
})

const admin = { ...TEST_ACTOR, role: 'admin' }
const LOCK = [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS, LOCKS.FULFILLMENTS]

const payout = {
  method: 'ACH',
  account_holder_name: 'Admin Entered Holder',
  bank_name: 'Test Bank',
  account_type: 'Checking',
  routing_number: '021000021',
  account_number: '000123456789',
}

test("an admin places a customer's SALE end to end, paid by the non-card CREDIT method", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c, { funds: 1_000_000 })
      const address = await anAddress(c, customer)
      const product = await aProduct(c, { metal_id: 'Gold', content: 0.001, ask_premium: 1 })

      const credit = await paymentMethodId(c, 'CREDIT', 'sale')
      const method_id = await fulfillmentMethodId(c, 'DROPSHIP', 'sale')
      const carrier_service_id = await saleServiceId(c)
      const placed = await as(admin, () =>
        request(app)
          .post('/api/orders/admin')
          .send({
            direction: 'sale',
            user_id: customer.id,
            lots: [{ bullion_id: product.id, quantity: 2 }],
            fulfillment: { method_id, choices: { shipment: { carrier_service_id } } },
            payment_method_id: credit,
            recipient_address_id: address.id,
          })
      )

      assert.equal(placed.status, 201, placed.text)
      assert.equal(placed.body.order.direction, 'sale')
      assert.equal(placed.body.order.user_id, customer.id, 'the order belongs to somebody else')
      assert.equal(placed.body.order.status, 'Preparing', 'a credit-paid sale was born Pending')
      assert.equal(placed.body.lots.length, 1)
      assert.equal(Number(placed.body.lots[0].lot.quantity), 2)
      assert.ok(placed.body.address, 'the sale kept no address snapshot')
      assert.equal(placed.body.totals.used_funds, true, "the customer's credit was not applied")

      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM payments.intents WHERE user_id = $1`,
        [customer.id],
        c
      )
      assert.equal(rows[0]?.n, 0, 'a non-card sale opened a payment intent')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test("an admin places a customer's PURCHASE end to end, payout account and all", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const address = await anAddress(c, customer)
      const product = await aProduct(c, { metal_id: 'Gold' })

      const method_id = await fulfillmentMethodId(c, 'PICKUP', 'purchase')
      const placed = await as(admin, () =>
        request(app)
          .post('/api/orders/admin')
          .send({
            direction: 'purchase',
            user_id: customer.id,
            lots: [{ bullion_id: product.id, quantity: 1 }],
            fulfillment: {
              method_id,
              choices: {
                pickup: {
                  pickup_address_id: address.id,
                  start_time: '2026-10-01T15:00:00.000Z',
                },
              },
            },
            payout,
          })
      )

      assert.equal(placed.status, 201, placed.text)
      assert.equal(placed.body.order.direction, 'purchase')
      assert.equal(placed.body.order.user_id, customer.id)
      assert.equal(placed.body.order.status, 'In Transit')
      assert.equal(placed.body.lots.length, 1)
      assert.equal(placed.body.payout?.account_last4, '6789', 'the payout account was not attached')
      assert.equal(placed.body.payout?.method, 'ACH')
      assert.ok(placed.body.totals, 'the purchase wrote no totals row')

      const { rows } = await query<{ routing_number: string | null; sealed: string | null }>(
        `SELECT d.routing_number, d.routing_number_encrypted AS sealed
         FROM payments.details d WHERE d.user_id = $1`,
        [customer.id],
        c
      )
      assert.equal(rows[0]?.routing_number, null, 'the admin path wrote a plaintext routing number')
      assert.ok(rows[0]?.sealed?.startsWith('v1.'), 'the admin path sealed nothing')
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})

test('the admin body must carry every fact placement needs, and says which is missing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const address = await anAddress(c, customer)
      const product = await aProduct(c, { metal_id: 'Gold' })
      const method_id = await fulfillmentMethodId(c, 'PICKUP', 'purchase')

      const unscheduled = await as(admin, () =>
        request(app)
          .post('/api/orders/admin')
          .send({
            direction: 'purchase',
            user_id: customer.id,
            lots: [{ bullion_id: product.id, quantity: 1 }],
            fulfillment: {
              method_id,
              choices: { pickup: { pickup_address_id: address.id } },
            },
            payout,
          })
      )
      assert.equal(unscheduled.status, 422, unscheduled.text)
      assert.match(unscheduled.body?.error?.message ?? '', /start_time/)

      const unknownField = await as(admin, () =>
        request(app)
          .post('/api/orders/admin')
          .send({
            direction: 'purchase',
            user_id: customer.id,
            lots: [],
            fulfillment: { method_id, choices: { pickup: {} } },
            payout,
            recipient_address_id: address.id,
          })
      )
      assert.equal(unknownField.status, 400, unknownField.text)
      assert.match(unknownField.body?.error?.message ?? '', /recipient_address_id/)
    },
    { actor: TEST_ACTOR.id, lock: LOCK }
  )
})
