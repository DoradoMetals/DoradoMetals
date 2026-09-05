import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { anUnknownId, aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as paymentsService from '#transactions/service.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { PaymentIntentView } from '@dorado/contracts'

await mockSessions()
const { default: app } = await import('#app')

const PAYMENTS_LOCKS = [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS]

type UserFixture = { id: string; name: string | null; email: string | null }

let admin: UserFixture
const customer: UserFixture = {
  id: anUnknownId(),
  name: 'Replay Customer',
  email: 'replay-customer@dorado.test',
}
const victim: UserFixture = {
  id: anUnknownId(),
  name: 'Replay Victim',
  email: 'replay-victim@dorado.test',
}
let intentsBefore: number

beforeAll(async () => {
  admin = TEST_ACTOR

  const rows = await outside(`SELECT count(*)::int AS n FROM payments.intents`)
  intentsBefore = rows[0].n
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('every route refuses an anonymous caller', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const calls = [
          [
            'retrieve_payment_intent',
            request(app).get('/api/stripe/retrieve_payment_intent').query({ type: 'customer' }),
          ],
          [
            'get_sales_order_payment_intent',
            request(app)
              .get('/api/stripe/get_sales_order_payment_intent')
              .query({ order_id: randomUUID() }),
          ],
          [
            'update_payment_intent',
            request(app).post('/api/stripe/update_payment_intent').send({}),
          ],
          [
            'cancel_payment_intent',
            request(app).post('/api/stripe/cancel_payment_intent').send({ id: 'pi_nope' }),
          ],
        ] as Array<[string, Promise<{ status: number }>]>
        for (const [name, call] of calls) {
          const res = await call
          assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} anonymously`)
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS }
  )
})

test("a customer cannot claim type=admin to read another user's payment intent", async () => {
  await inPinnedTransaction(
    async () => {
      await as(Object.assign({}, customer, { role: 'user' }), async () => {
        const res = await request(app)
          .get('/api/stripe/retrieve_payment_intent')
          .query({ type: 'admin', user_id: victim.id })

        assert.equal(res.status, 403, `answered ${res.status} to a claimed admin type`)

        assert.ok(
          typeof res.body !== 'string' || !res.body.startsWith('pi_'),
          'a refused request still returned a Stripe client_secret'
        )
        assert.ok(
          !JSON.stringify(res.body ?? '').includes('_secret'),
          'a refused request still returned something secret-shaped'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS }
  )
})

test('a customer cannot claim type=admin even against their own id', async () => {
  await inPinnedTransaction(
    async () => {
      await as(Object.assign({}, customer, { role: 'user' }), async () => {
        const res = await request(app)
          .get('/api/stripe/retrieve_payment_intent')
          .query({ type: 'admin', user_id: customer.id })
        assert.equal(res.status, 403, `answered ${res.status} to a claimed admin type`)
      })
    },
    { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS }
  )
})

test('the two admin-only routes refuse a signed-in customer', async () => {
  await inPinnedTransaction(
    async () => {
      await as(Object.assign({}, customer, { role: 'user' }), async () => {
        const calls = [
          [
            'get_sales_order_payment_intent',
            request(app)
              .get('/api/stripe/get_sales_order_payment_intent')
              .query({ order_id: randomUUID() }),
          ],
          [
            'cancel_payment_intent',
            request(app).post('/api/stripe/cancel_payment_intent').send({ id: 'pi_nope' }),
          ],
        ] as Array<[string, Promise<{ status: number }>]>
        for (const [name, call] of calls) {
          const res = await call
          assert.ok([401, 403].includes(res.status), `${name} answered ${res.status} to a customer`)
        }
      })
    },
    { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS }
  )
})

test('the refused requests created no payment intent', async () => {
  const rows = await outside(`SELECT count(*)::int AS n FROM payments.intents`)
  assert.equal(
    rows[0].n,
    intentsBefore,
    'a route that answered 401/403 still wrote a payment intent'
  )
})

test("an admin reading a sales order's payment intent gets it, in the nested wire shape", async () => {
  await inPinnedTransaction(
    async (c) => {
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'sale' })
      const providerRef = `pi_${anUnknownId().slice(0, 24)}`
      await paymentsService.recordIntent(
        { id: providerRef, status: 'succeeded', amount: 25000, amount_received: 25000 },
        { session_id: anUnknownId(), user_id: buyer.id },
        'checkout',
        undefined,
        c
      )
      assert.ok(
        await paymentsService.attachOrder(providerRef, order.id, c),
        'the built intent did not attach to the built order'
      )

      await as(Object.assign({}, admin, { role: 'admin' }), async () => {
        const res = await request(app)
          .get('/api/stripe/get_sales_order_payment_intent')
          .query({ order_id: order.id })

        assert.equal(res.status, 200, `answered ${res.status} to an admin`)
        assert.ok(res.body && typeof res.body === 'object', 'the body was not an object')

        const parsed = PaymentIntentView.safeParse(res.body)
        assert.ok(
          parsed.success,
          'the response does not satisfy the nested contract: ' +
            JSON.stringify(parsed.error?.issues?.slice(0, 4))
        )

        assert.equal(res.body.attempt?.provider_ref, providerRef, 'a different intent came back')

        assert.equal(Number(res.body.amount_expected), 250, 'the wire is not in dollars')

        assert.ok(!('payment_intent_id' in res.body), 'the legacy names came back to the wire')
        assert.ok(!('payment_status' in res.body), 'the legacy names came back to the wire')
        assert.ok(!/"routing"/.test(JSON.stringify(res.body)), 'a routing key reached the wire')
      })
    },
    { actor: TEST_ACTOR.id, lock: PAYMENTS_LOCKS }
  )
})
