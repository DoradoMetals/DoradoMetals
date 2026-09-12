import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, aVisitor } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const verified = async (c: PoolClient, phone_number: string) => {
  const user = await aUser(c, { phone_number, funds: 42.5 })
  await c.query(`UPDATE auth.users SET phone_number_verified = true WHERE id = $1`, [user.id])
  return { ...user, role: 'user' }
}

test('GET /api/account/me answers the caller own profile: name, verified flags, credit', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await verified(c, '+15125550134')

      await as(customer, async () => {
        const res = await request(app).get('/api/account/me')
        assert.equal(res.status, 200, res.text)
        assert.equal(res.body.id, customer.id)
        assert.equal(res.body.name, customer.name)
        assert.equal(res.body.email, customer.email)
        assert.equal(res.body.phone_number, '+15125550134')
        assert.equal(res.body.phone_number_verified, true)
        assert.equal(res.body.email_verified, true)
        assert.equal(Number(res.body.dorado_funds), 42.5)
        assert.equal(res.body.deletion_requested_at, null)
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a signed-out caller is refused', async () => {
  const res = await request(app).get('/api/account/me')
  assert.equal(res.status, 401, res.text)
})

test('PATCH /api/account/me writes only the name, and refuses any other field', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = { ...(await aUser(c)), role: 'user' }

      await as(customer, async () => {
        const renamed = await request(app).patch('/api/account/me').send({ name: 'New Name' })
        assert.equal(renamed.status, 200, renamed.text)
        assert.equal(renamed.body.name, 'New Name')
        assert.equal(renamed.body.email, customer.email, 'the email moved off a name-only patch')

        const refused = await request(app)
          .patch('/api/account/me')
          .send({ email: 'somebody-else@dorado.test' })
        assert.equal(refused.status, 400, 'an email change slipped through the profile PATCH')
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('DELETE /api/account requests deletion as a fact, read back on the profile', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = { ...(await aUser(c)), role: 'user' }

      await as(customer, async () => {
        const deleted = await request(app).delete('/api/account')
        assert.equal(deleted.status, 200, deleted.text)
        assert.ok(deleted.body.deletion_requested_at, 'the request left no fact on the row')

        const read = await request(app).get('/api/account/me')
        assert.equal(read.status, 200, read.text)
        assert.equal(
          read.body.deletion_requested_at,
          deleted.body.deletion_requested_at,
          'the profile does not read back its own deletion request'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('an anonymous visitor has no account to delete', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const visitor = { ...(await aVisitor(c)), role: 'user' }

      await as(visitor, async () => {
        const res = await request(app).delete('/api/account')
        assert.equal(res.status, 403, res.text)
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})
