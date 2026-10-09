import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aNote, aUser } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: TEST_ACTOR.id, name: TEST_ACTOR.name, email: TEST_ACTOR.email, role: 'admin' }, fn)
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as(
    { id: TEST_CUSTOMER.id, name: TEST_CUSTOMER.name, email: TEST_CUSTOMER.email, role: 'user' },
    fn
  )

test('only an admin may read the feed', async () => {
  await inPinnedTransaction(
    async () => {
      await asCustomer(async () => {
        assert.equal((await request(app).get('/api/activity')).status, 403)
      })
      await anonymous(async () => {
        assert.ok([401, 403].includes((await request(app).get('/api/activity')).status))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the feed answers rows an admin can read', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      await aNote(c, { user_id: customer.id }, 'Prefers a call before we ship')

      await asAdmin(async () => {
        const res = await request(app).get('/api/activity')
        assert.equal(res.status, 200, JSON.stringify(res.body))
        const mine = res.body.filter((r: { subject_id: string }) => r.subject_id === customer.id)
        assert.equal(mine.length, 1, JSON.stringify(res.body.slice(0, 3)))
        assert.equal(mine[0].kind, 'note')
        assert.equal(mine[0].subject_kind, 'customer')
        assert.equal(mine[0].subject_name, customer.name)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the limit is honoured and a silly one is refused', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const capped = await request(app).get('/api/activity?limit=1')
        assert.equal(capped.status, 200, JSON.stringify(capped.body))
        assert.ok(capped.body.length <= 1)

        assert.equal((await request(app).get('/api/activity?limit=0')).status, 400)
        assert.equal((await request(app).get('/api/activity?limit=5000')).status, 400)
        assert.equal((await request(app).get('/api/activity?limit=lots')).status, 400)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an employee_id that is not a uuid is refused, and an unknown query key too', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        assert.equal((await request(app).get('/api/activity?employee_id=nobody')).status, 400)
        assert.equal((await request(app).get('/api/activity?actor=someone')).status, 400)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the employee filter narrows the feed to one actor', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      await aNote(c, { user_id: customer.id }, 'written by the acting admin')

      await asAdmin(async () => {
        const res = await request(app).get(`/api/activity?employee_id=${TEST_ACTOR.id}`)
        assert.equal(res.status, 200, JSON.stringify(res.body))
        assert.ok(
          res.body.every((r: { actor_id: string }) => r.actor_id === TEST_ACTOR.id),
          'the employee filter let another actor through'
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
