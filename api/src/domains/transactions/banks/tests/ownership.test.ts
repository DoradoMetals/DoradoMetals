import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as bankLinks from '#db/payments/bank-links/repo.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const aLinkFor = async (c: PoolClient, user_id: string) =>
  await bankLinks.create(
    {
      user_id,
      provider: 'moov',
      moov_account_id: 'acct_test',
      moov_bank_account_id: 'bank_test',
      payment_method_id: null,
      rail: 'ACH',
      holder_name: 'Test Holder',
      bank_name: 'Test Bank',
      last_four: '4417',
      status: 'verified',
      linked_by: 'plaid',
    },
    c
  )

test("a customer's payout account list carries only their own bank links", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = { ...(await aUser(c, { name: 'The Owner' })), role: 'user' }
      const stranger = { ...(await aUser(c, { name: 'The Stranger' })), role: 'user' }
      const link = await aLinkFor(c, owner.id)
      await aLinkFor(c, stranger.id)

      await as(owner, async () => {
        const res = await request(app).get('/api/payments/banks')
        assert.equal(res.status, 200, res.text)
        assert.ok(
          res.body.every((row: { id: string }) => row.id !== undefined),
          'the list carries no id'
        )
        assert.ok(
          res.body.some((row: { id: string }) => row.id === link.id),
          "the owner's own link is missing from their list"
        )
        assert.ok(
          res.body.every((row: { user_id: string }) => row.user_id === owner.id),
          "a customer's payout account list carried somebody else's bank link"
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test("a stranger cannot verify somebody else's bank link", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = { ...(await aUser(c, { name: 'The Owner' })), role: 'user' }
      const stranger = { ...(await aUser(c, { name: 'The Stranger' })), role: 'user' }
      const link = await aLinkFor(c, owner.id)

      await as(stranger, async () => {
        const res = await request(app)
          .post(`/api/payments/banks/${link.id}/verify`)
          .send({ amounts: [12, 34] })
        assert.equal(res.status, 404, `answered ${res.status} for somebody else's bank link`)
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('no bank link response carries a full account or routing number', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const owner = { ...(await aUser(c, { name: 'The Owner' })), role: 'user' }
      await aLinkFor(c, owner.id)

      await as(owner, async () => {
        const res = await request(app).get('/api/payments/banks')
        const body = JSON.stringify(res.body)
        assert.ok(!body.includes('routing_number'), 'a routing number field is on the wire')
        assert.ok(!body.includes('account_number'), 'an account number field is on the wire')
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})
