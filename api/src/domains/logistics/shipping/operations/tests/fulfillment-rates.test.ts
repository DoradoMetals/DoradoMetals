import { test, beforeAll, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { withCassette } from '#shared/testing/cassettes.ts'
import * as pricing from '#pricing/index.ts'
import * as carrierServices from '#logistics/shipping/services/service.ts'
import * as shippingRules from '#logistics/shipping/rules.ts'
import type { PurchaseQuote } from '@dorado/contracts'
import {
  aUser,
  aProduct,
  anAddress,
  packageId,
  carrierServiceId,
  fulfillmentMethodId,
} from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')
const checkoutService = await import('#checkout/service.ts')

let previousFedexEnv: string | undefined

beforeAll(() => {
  previousFedexEnv = process.env.FEDEX_ENV
  process.env.FEDEX_ENV = 'sandbox'
})

afterAll(async () => {
  if (previousFedexEnv === undefined) delete process.env.FEDEX_ENV
  else process.env.FEDEX_ENV = previousFedexEnv
  restoreSessions()
  await pool.end()
})

type Person = { id: string }
async function aDraft(customer: Person): Promise<string> {
  const row = await checkoutService.getRowFor(customer.id, 'purchase')
  const res = await as(customer, () =>
    request(app).post('/api/fulfillments').send({ checkout_id: row.id })
  )
  assert.equal(res.status, 200, res.text)
  return res.body.fulfillment.id as string
}

const rates = (customer: Person, fulfillment_id: string) =>
  as(customer, () => request(app).get(`/api/fulfillments/${fulfillment_id}/rates`))

test('an empty basket is refused before any carrier is asked', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const res = await rates(customer, await aDraft(customer))
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`)
      assert.match(res.body?.error?.message ?? '', /no items to rate/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('a collection has no parcel, so there is nothing to rate', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const row = await checkoutService.getRowFor(customer.id, 'purchase')
      const method_id = await fulfillmentMethodId(c, 'PICKUP', 'purchase')
      const collected = await as(customer, () =>
        request(app).post('/api/fulfillments').send({ checkout_id: row.id, method_id })
      )
      assert.equal(collected.status, 200, collected.text)
      const res = await rates(customer, collected.body.fulfillment.id)
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`)
      assert.match(res.body?.error?.message ?? '', /not a shipment/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('no package chosen is refused before any carrier is asked', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const product = await aProduct(c)
      const put = await as(customer, () =>
        request(app)
          .put('/api/checkout/lots')
          .query({ direction: 'purchase' })
          .send({ lots: [{ bullion_id: product.id, quantity: 1 }] })
      )
      assert.equal(put.status, 200, put.text)

      const res = await rates(customer, await aDraft(customer))
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`)
      assert.match(res.body?.error?.message ?? '', /choose a package/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('no address chosen is refused before any carrier is asked', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const product = await aProduct(c)
      const box = await packageId(c, 'Small Box')
      const service = await carrierServiceId(c, 'Express Saver')

      await as(customer, () =>
        request(app)
          .put('/api/checkout/lots')
          .query({ direction: 'purchase' })
          .send({ lots: [{ bullion_id: product.id, quantity: 1 }] })
      )
      const draft = await aDraft(customer)
      const patched = await as(customer, () =>
        request(app)
          .patch(`/api/fulfillments/${draft}`)
          .send({
            shipment: { package_id: box, carrier_service_id: service },
          })
      )
      assert.equal(patched.status, 200, patched.text)

      const res = await rates(customer, draft)
      assert.equal(res.status, 422, `answered ${res.status}: ${JSON.stringify(res.body)}`)
      assert.match(res.body?.error?.message ?? '', /choose an address/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test("a stranger cannot read somebody else's draft or its rates", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const stranger = await aUser(c, { name: 'A Stranger' })
      await anAddress(c, customer)
      const draft = await aDraft(customer)

      assert.equal((await rates(stranger, draft)).status, 404)
      assert.equal(
        (await as(stranger, () => request(app).get(`/api/fulfillments/${draft}`))).status,
        404
      )
      assert.equal(
        (
          await as(stranger, () =>
            request(app)
              .patch(`/api/fulfillments/${draft}`)
              .send({ shipment: { package_id: null } })
          )
        ).status,
        404
      )
      assert.equal(
        (await as(customer, () => request(app).get(`/api/fulfillments/${draft}`))).status,
        200
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})

test('a complete purchase checkout gets back priced services', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      await anAddress(c, customer, {
        line_1: '6100 Main St',
        city: 'Houston',
        state: 'TX',
        zip: '77005',
        country_code: 'US',
      })
      const product = await aProduct(c)
      const put = await as(customer, () =>
        request(app)
          .put('/api/checkout/lots')
          .query({ direction: 'purchase' })
          .send({ lots: [{ bullion_id: product.id, quantity: 1 }] })
      )
      assert.equal(put.status, 200, put.text)

      const { rows: bandRows } = await c.query<{ bullion_pct: string }>(
        `SELECT bullion_pct FROM rates.rates WHERE metal_id = 'Gold' ORDER BY min_qty ASC LIMIT 1`
      )
      assert.ok(bandRows.length > 0, 'dev has no Gold bullion rate band - the fixture needs one')
      const pct = Number(bandRows[0]!.bullion_pct)
      const bid = Math.ceil(20000 / pct)
      await c.query(`UPDATE spots.spots SET bid = $1, ask = $1 WHERE metal_id = 'Gold'`, [bid])

      const draft = await aDraft(customer)
      const box = await packageId(c, 'Small Box')
      const service = await carrierServiceId(c, 'Express Saver')
      const patched = await as(customer, () =>
        request(app)
          .patch(`/api/fulfillments/${draft}`)
          .send({ shipment: { package_id: box, carrier_service_id: service } })
      )
      assert.equal(patched.status, 200, patched.text)

      const checkout = await checkoutService.getRowFor(customer.id, 'purchase')
      const quote = (await pricing.priceCheckout(checkout.id)) as PurchaseQuote
      assert.equal(quote.direction, 'purchase')
      assert.ok(
        quote.total > 10000,
        `fixture needs a total above the insurance ceiling to prove clamping; got ${quote.total}`
      )
      const clamped = await carrierServices.clampInsuredValue(
        shippingRules.declaredValue(quote.total)
      )
      assert.equal(clamped, 10000, 'the ceiling did not clamp a total that exceeds it')

      const res = await withCassette('fedex/fulfillment-purchase-rates.json', () =>
        rates(customer, draft)
      )
      assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

      const offered = res.body as Array<{
        serviceType: string | null
        name: string
        netCharge: number | null
        max_insured_value: number | null
        selected: boolean
      }>
      assert.equal(offered.length, 2, 'the FedEx catalogue offers two label services')
      for (const svc of offered) {
        assert.ok(svc.serviceType, `${svc.name || 'a service'} carries no code`)
        assert.ok(svc.name, 'a service carries no name')
        assert.equal(typeof svc.netCharge, 'number', `${svc.name} carries no price`)
        assert.equal(
          svc.max_insured_value,
          10000,
          `${svc.name} did not carry the seeded insurance ceiling`
        )
      }
      const chosen = offered.find((s) => s.name === 'Express Saver')
      assert.equal(
        chosen?.selected,
        true,
        'the service chosen on the parcel is not marked selected'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] }
  )
})
