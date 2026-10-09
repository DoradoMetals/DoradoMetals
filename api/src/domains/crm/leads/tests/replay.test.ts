import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction, assertNothingEscaped } from '#shared/testing/pinned-pool.ts'
import { anUnknownId } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }

let admin: UserFixture
let customer: UserFixture
const someLeadId = anUnknownId()
const created: string[] = []

beforeAll(async () => {
  admin = TEST_ACTOR

  customer = TEST_CUSTOMER
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const newLead = () => ({
  name: `replay-${randomUUID().slice(0, 8)}`,
  phone: '5550000000',
  email: `replay-${randomUUID().slice(0, 8)}@example.com`,
  priority: 'low',
})

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: admin.id, name: admin.name, email: admin.email, role: 'admin' }, fn)
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as({ id: customer.id, name: customer.name, email: customer.email, role: 'user' }, fn)

test('an anonymous request is refused before it reaches a controller', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/leads')
        assert.ok([401, 403].includes(res.status), `answered with ${res.status}`)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a signed-in customer is refused every route', async () => {
  await inPinnedTransaction(
    async () => {
      await asCustomer(async () => {
        const calls = [
          request(app).get('/api/leads'),
          request(app).get(`/api/leads/${someLeadId}`),
          request(app).post('/api/leads').send(newLead()),
          request(app).patch(`/api/leads/${someLeadId}`).send({}),
          request(app).delete(`/api/leads/${someLeadId}`),
        ]
        for (const call of calls) {
          const res = await call
          assert.ok(
            [401, 403].includes(res.status),
            `${res.request.method} ${res.request.url} answered ${res.status} to a non-admin`
          )
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an admin gets the list in the shape the table reads', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const res = await request(app).get('/api/leads')
        assert.equal(res.status, 200)
        assert.ok(Array.isArray(res.body), 'the leads table expects an array')
        assert.ok(res.body.length > 0, 'dev has leads and none came back')

        const lead = res.body[0]
        for (const field of ['id', 'name', 'email', 'phone', 'created_at']) {
          assert.ok(field in lead, `the response is missing ${field}`)
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('creating a lead round-trips and appears in the list', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const lead = newLead()
        const res = await request(app).post('/api/leads').send(lead)
        assert.equal(res.status, 201, JSON.stringify(res.body))
        created.push(lead.name)

        const saved = Array.isArray(res.body) ? res.body[0] : res.body
        assert.ok(saved?.id, 'no id came back, so the frontend cannot select it')
        assert.equal(saved.name, lead.name, 'the name was lost on the way out')

        const back = await request(app).get('/api/leads')
        assert.ok(
          back.body.some((l: { id: string; name: string }) => l.name === lead.name),
          'the lead created a moment ago is not in the list'
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('updating a lead changes it and leaves the others alone', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const before = await request(app).get('/api/leads')
        const target = before.body[0]
        const others = before.body.length

        const res = await request(app).patch(`/api/leads/${target.id}`).send({ priority: 'urgent' })
        assert.equal(res.status, 200, JSON.stringify(res.body))

        const after = await request(app).get('/api/leads')
        assert.equal(after.body.length, others, 'an update changed how many leads exist')
        const updated = after.body.find((l: { id: string; name: string }) => l.id === target.id)
        assert.equal(updated.priority, 'urgent')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('deleting removes exactly one lead, and only for an admin', async () => {
  await inPinnedTransaction(
    async () => {
      const lead = newLead()
      let id: string | undefined

      await asAdmin(async () => {
        const made = await request(app).post('/api/leads').send(lead)
        created.push(lead.name)
        id = (Array.isArray(made.body) ? made.body[0] : made.body).id
      })

      await asCustomer(async () => {
        const res = await request(app).delete(`/api/leads/${id}`)
        assert.ok([401, 403].includes(res.status), `a non-admin got ${res.status} deleting a lead`)
      })

      await asAdmin(async () => {
        const before = await request(app).get('/api/leads')
        assert.ok(
          before.body.some((l: { id: string; name: string }) => l.id === id),
          'the non-admin delete went through'
        )

        const res = await request(app).delete(`/api/leads/${id}`)
        assert.equal(res.status, 200, JSON.stringify(res.body))

        const after = await request(app).get('/api/leads')
        assert.equal(after.body.length, before.body.length - 1, 'delete removed the wrong number')
        assert.ok(
          !after.body.some((l: { id: string; name: string }) => l.id === id),
          'the lead is still there'
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('nothing this file created survived the transaction', async () => {
  assert.ok(created.length > 0, 'no lead was created, so this proves nothing')
  for (const name of created) {
    assert.equal(
      await assertNothingEscaped('exchange.leads', 'name = $1', [name]),
      0,
      `${name} was committed to dev`
    )
  }
})
