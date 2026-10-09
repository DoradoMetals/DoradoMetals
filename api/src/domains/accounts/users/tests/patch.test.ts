import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import {
  mockSessions,
  restoreSessions,
  asAdmin,
  asUser,
  anonymous,
} from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('banning without a reason is refused', async () => {
  await inPinnedTransaction(
    async (client) => {
      const customer = await aUser(client)
      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).patch(`/api/users/${customer.id}`).send({ banned: true })
      )
      assert.equal(res.status, 422, JSON.stringify(res.body))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('banning with a reason sets the ban facts, and unbanning needs no reason', async () => {
  await inPinnedTransaction(
    async (client) => {
      const customer = await aUser(client)

      const banned = await asAdmin(TEST_ACTOR, () =>
        request(app)
          .patch(`/api/users/${customer.id}`)
          .send({ banned: true, ban_reason: 'chargebacks on two orders' })
      )
      assert.equal(banned.status, 200, JSON.stringify(banned.body))
      assert.equal(banned.body.banned, true)
      assert.equal(banned.body.ban_reason, 'chargebacks on two orders')

      const unbanned = await asAdmin(TEST_ACTOR, () =>
        request(app).patch(`/api/users/${customer.id}`).send({ banned: false })
      )
      assert.equal(unbanned.status, 200, JSON.stringify(unbanned.body))
      assert.equal(unbanned.body.banned, false)
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('assigned_to is a patchable fact, and the move is kept as a row', async () => {
  await inPinnedTransaction(
    async (client) => {
      const customer = await aUser(client)
      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).patch(`/api/users/${customer.id}`).send({ assigned_to_id: TEST_ACTOR.id })
      )
      assert.equal(res.status, 200, JSON.stringify(res.body))
      assert.equal(res.body.assigned_to_id, TEST_ACTOR.id)

      const { rows } = await client.query(
        `SELECT assigned_to_id, created_by_id FROM crm.assignments WHERE user_id = $1`,
        [customer.id]
      )
      assert.equal(rows.length, 1, 'the assignment left no row behind')
      assert.equal(rows[0].assigned_to_id, TEST_ACTOR.id)
      assert.equal(rows[0].created_by_id, TEST_ACTOR.id, 'the trigger did not stamp the actor')
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('a patch that resends the same assignee writes no second assignment row', async () => {
  await inPinnedTransaction(
    async (client) => {
      const customer = await aUser(client)
      const patch = () =>
        asAdmin(TEST_ACTOR, () =>
          request(app).patch(`/api/users/${customer.id}`).send({ assigned_to_id: TEST_ACTOR.id })
        )
      await patch()
      await patch()

      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM crm.assignments WHERE user_id = $1`,
        [customer.id]
      )
      assert.equal(rows[0].n, 1, 'an unchanged assignee was recorded twice')
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('notes is no longer a patchable column - a note is a row', async () => {
  await inPinnedTransaction(
    async (client) => {
      const customer = await aUser(client)
      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).patch(`/api/users/${customer.id}`).send({ notes: 'should not land' })
      )
      assert.equal(res.status, 400, JSON.stringify(res.body))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('an unknown key in the patch is refused', async () => {
  await inPinnedTransaction(
    async (client) => {
      const customer = await aUser(client)
      const res = await asAdmin(TEST_ACTOR, () =>
        request(app).patch(`/api/users/${customer.id}`).send({ role: 'admin' })
      )
      assert.equal(res.status, 400, JSON.stringify(res.body))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('a non-admin cannot patch a customer', async () => {
  await inPinnedTransaction(
    async (client) => {
      const customer = await aUser(client)

      const asCustomer = await asUser({ id: customer.id, role: 'user' }, () =>
        request(app).patch(`/api/users/${customer.id}`).send({ banned: true, ban_reason: 'nope' })
      )
      assert.ok([401, 403].includes(asCustomer.status))

      const asAnon = await anonymous(() =>
        request(app).patch(`/api/users/${customer.id}`).send({ banned: true, ban_reason: 'nope' })
      )
      assert.ok([401, 403].includes(asAnon.status))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('the list and single-user reads carry the new fields', async () => {
  await inPinnedTransaction(
    async () => {
      const res = await asAdmin(TEST_ACTOR, () => request(app).get('/api/users'))
      assert.equal(res.status, 200)
      assert.ok(res.body.length > 0)
      for (const field of [
        'orders_count',
        'open_orders_count',
        'last_contact',
        'banned',
        'ban_reason',
        'ban_expires',
        'assigned_to_id',
        'notes',
        'deletion_requested_at',
        'customer_state',
      ]) {
        assert.ok(field in res.body[0], `the admin list is missing ${field}`)
      }
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})
