import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder, type BuiltUser } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const sessionOf = (u: BuiltUser) => ({ id: u.id, name: u.name, email: u.email, role: 'user' })

const ATTACKER_ADDRESS = 'attacker@example.invalid'

test('both routes refuse an anonymous caller', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        for (const path of ['purchase_order_priced']) {
          const res = await request(app).post(`/api/emails/${path}`).send({})
          assert.ok([401, 403].includes(res.status), `${path} answered ${res.status}`)
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an address in the body cannot redirect the order confirmation', async () => {
  await inPinnedTransaction(
    async (c) => {
      const owner = await aUser(c)
      const order = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
      await as(sessionOf(owner), async () => {
        const gone = await request(app)
          .post('/api/emails/purchase_order_created')
          .send({ order_id: order.id })
        assert.equal(gone.status, 404, 'the browser-triggered confirmation route is back')

        const res = await request(app)
          .post('/api/emails/purchase_order_priced')
          .send({
            order_id: order.id,
            user: { user_email: ATTACKER_ADDRESS, user_name: 'whoever' },
          })

        assert.ok(
          !JSON.stringify(res.body ?? '').includes(ATTACKER_ADDRESS),
          "the response named the attacker's address"
        )
        assert.notEqual(res.status, 200, 'the route reported a successful send')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an email field in the body cannot redirect the pricing notice', async () => {
  await inPinnedTransaction(
    async (c) => {
      const owner = await aUser(c)
      const order = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
      await as(sessionOf(owner), async () => {
        const res = await request(app)
          .post('/api/emails/purchase_order_priced')
          .send({ order_id: order.id, email: ATTACKER_ADDRESS })
        assert.ok(
          !JSON.stringify(res.body ?? '').includes(ATTACKER_ADDRESS),
          "the response named the attacker's address"
        )
        assert.notEqual(res.status, 200, 'the route reported a successful send')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test("a stranger cannot trigger mail about someone else's order", async () => {
  await inPinnedTransaction(
    async (c) => {
      const owner = await aUser(c)
      const stranger = await aUser(c)
      const order = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
      await as(sessionOf(stranger), async () => {
        const res = await request(app)
          .post('/api/emails/purchase_order_priced')
          .send({ order_id: order.id })
        assert.equal(res.status, 403, `a stranger got ${res.status} for another user's order`)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an unknown or missing order id is refused before anything is built', async () => {
  await inPinnedTransaction(
    async (c) => {
      const owner = await aUser(c)
      await as(sessionOf(owner), async () => {
        const missing = await request(app).post('/api/emails/purchase_order_priced').send({})
        assert.equal(missing.status, 400, `a body with no order id answered ${missing.status}`)

        const unknown = await request(app)
          .post('/api/emails/purchase_order_priced')
          .send({ order_id: randomUUID() })
        assert.equal(unknown.status, 404, `an unknown order answered ${unknown.status}`)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('no real mail transport is reachable during this run', async () => {
  const { sendEmail } = await import('#providers/emails/index.ts')
  const result = (await sendEmail({ to: ATTACKER_ADDRESS, subject: 'x', html: 'x' })) as {
    messageId: string
  }
  assert.match(result.messageId, /^fake-/, 'the suite could have sent real mail')
})
