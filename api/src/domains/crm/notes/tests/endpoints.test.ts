import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import { mockSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aLead, aUser } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: TEST_ACTOR.id, name: TEST_ACTOR.name, email: TEST_ACTOR.email, role: 'admin' }, fn)
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as(
    { id: TEST_CUSTOMER.id, name: TEST_CUSTOMER.name, email: TEST_CUSTOMER.email, role: 'user' },
    fn
  )

test('a customer cannot reach any note route', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      await asCustomer(async () => {
        assert.equal((await request(app).get(`/api/notes?user_id=${customer.id}`)).status, 403)
        assert.equal(
          (await request(app).post('/api/notes').send({ user_id: customer.id, body: 'hi' })).status,
          403
        )
        assert.equal(
          (
            await request(app).patch('/api/notes/00000000-0000-4000-8000-000000000001').send({
              body: 'hi',
            })
          ).status,
          403
        )
        assert.equal(
          (await request(app).delete('/api/notes/00000000-0000-4000-8000-000000000001')).status,
          403
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('POST writes a note on a customer, GET ?user_id= serves it back', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)

      await asAdmin(async () => {
        const made = await request(app)
          .post('/api/notes')
          .send({ user_id: customer.id, body: 'called about the order' })
        assert.equal(made.status, 201, JSON.stringify(made.body))
        assert.equal(made.body.user_id, customer.id)
        assert.equal(made.body.lead_id, null)
        assert.equal(made.body.created_by_id, TEST_ACTOR.id)
        assert.equal(made.body.author_name, TEST_ACTOR.name)

        const listed = await request(app).get(`/api/notes?user_id=${customer.id}`)
        assert.equal(listed.status, 200)
        assert.deepEqual(
          listed.body.map((row: { id: string }) => row.id),
          [made.body.id]
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('POST writes a note on a lead, GET ?lead_id= serves it back', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)

      await asAdmin(async () => {
        const made = await request(app)
          .post('/api/notes')
          .send({ lead_id: lead.id, body: 'left a voicemail' })
        assert.equal(made.status, 201, JSON.stringify(made.body))
        assert.equal(made.body.lead_id, lead.id)
        assert.equal(made.body.user_id, null)

        const listed = await request(app).get(`/api/notes?lead_id=${lead.id}`)
        assert.equal(listed.status, 200)
        assert.deepEqual(
          listed.body.map((row: { id: string }) => row.id),
          [made.body.id]
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a body with both user_id and lead_id, or with neither, is refused', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const lead = await aLead(c)

      await asAdmin(async () => {
        const both = await request(app)
          .post('/api/notes')
          .send({ user_id: customer.id, lead_id: lead.id, body: 'ambiguous' })
        assert.ok([400, 422].includes(both.status), JSON.stringify(both.body))

        const neither = await request(app).post('/api/notes').send({ body: 'no subject' })
        assert.ok([400, 422].includes(neither.status), JSON.stringify(neither.body))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an unknown field in the body is refused, not ignored', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)

      await asAdmin(async () => {
        const bad = await request(app)
          .post('/api/notes')
          .send({ user_id: customer.id, body: 'hi', color: 'red' })
        assert.ok([400, 422].includes(bad.status), JSON.stringify(bad.body))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('GET with neither query parameter is refused', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const bad = await request(app).get('/api/notes')
        assert.equal(bad.status, 422, JSON.stringify(bad.body))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('PATCH edits the body, DELETE removes it, and a second DELETE is 404', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)

      await asAdmin(async () => {
        const made = await request(app)
          .post('/api/notes')
          .send({ user_id: customer.id, body: 'draft' })
        const id = made.body.id

        const patched = await request(app).patch(`/api/notes/${id}`).send({ body: 'final' })
        assert.equal(patched.status, 200, JSON.stringify(patched.body))
        assert.equal(patched.body.body, 'final')

        const gone = await request(app).delete(`/api/notes/${id}`)
        assert.equal(gone.status, 200)

        const again = await request(app).delete(`/api/notes/${id}`)
        assert.equal(again.status, 404)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a note id that is not a uuid is 400', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        assert.equal((await request(app).patch('/api/notes/not-a-uuid').send({})).status, 400)
        assert.equal((await request(app).delete('/api/notes/not-a-uuid')).status, 400)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
