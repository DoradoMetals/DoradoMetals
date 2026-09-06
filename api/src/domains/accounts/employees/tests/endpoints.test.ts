import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import request from 'supertest'
import { mockSessions, restoreSessions, as, asAdmin, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('the employee list answers an id AND a name, so a driver select is a choice', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app).get('/api/employees')
        assert.equal(res.status, 200, res.text)
        assert.ok(res.body.length > 0, 'auth.employees holds nobody to assign')
        for (const row of res.body) {
          assert.ok(row.id, 'an employee with no id')
          assert.equal(typeof row.name, 'string')
          assert.equal(row.enabled, true, 'a disabled employee was offered')
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the location list answers the offices a pickup, appointment or drop-off names', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app).get('/api/locations')
        assert.equal(res.status, 200, res.text)
        assert.ok(res.body.length > 0, 'places.locations holds no office')
        for (const row of res.body) assert.equal(row.enabled, true)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('both lists are admin-only', async () => {
  await inPinnedTransaction(
    async (c) => {
      const customer = await aUser(c)
      await as({ ...customer, role: 'user' }, async () => {
        for (const url of ['/api/employees', '/api/locations']) {
          assert.equal((await request(app).get(url)).status, 403, url)
        }
      })
      await anonymous(async () => {
        assert.equal((await request(app).get('/api/employees')).status, 401)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
