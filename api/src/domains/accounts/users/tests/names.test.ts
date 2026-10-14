import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asUser, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const UNKNOWN = '00000000-0000-4000-8000-00000000dead'
const anId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('a signed-in user gets bare id and name rows, and an unknown id is left out', async () => {
  await inPinnedTransaction(
    async (client) => {
      const one = await aUser(client)
      const two = await aUser(client)
      const res = await asUser(TEST_CUSTOMER, () =>
        request(app).get(`/api/users/names?ids=${one.id},${two.id},${UNKNOWN},${one.id}`)
      )
      assert.equal(res.status, 200, JSON.stringify(res.body))
      assert.equal(res.body.length, 2)
      assert.deepEqual(
        [...res.body].sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)),
        [
          { id: one.id, name: one.name },
          { id: two.id, name: two.name },
        ].sort((a, b) => a.id.localeCompare(b.id))
      )
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('more than 200 ids are refused with 400', async () => {
  const ids = Array.from({ length: 201 }, (_, n) => anId(n + 1)).join(',')
  const res = await asUser(TEST_CUSTOMER, () => request(app).get(`/api/users/names?ids=${ids}`))
  assert.equal(res.status, 400, JSON.stringify(res.body))
})

test('exactly 200 ids are accepted', async () => {
  const ids = Array.from({ length: 200 }, (_, n) => anId(n + 1)).join(',')
  const res = await asUser(TEST_CUSTOMER, () => request(app).get(`/api/users/names?ids=${ids}`))
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.deepEqual(res.body, [])
})

test('a missing or malformed id list is refused with 400', async () => {
  const none = await asUser(TEST_CUSTOMER, () => request(app).get('/api/users/names'))
  assert.equal(none.status, 400)
  const bad = await asUser(TEST_CUSTOMER, () => request(app).get('/api/users/names?ids=not-a-uuid'))
  assert.equal(bad.status, 400)
})

test('an anonymous caller is refused', async () => {
  const res = await anonymous(() => request(app).get(`/api/users/names?ids=${UNKNOWN}`))
  assert.ok(res.status === 401 || res.status === 403, `got ${res.status}`)
})
