import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, aLedgerEntry } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

async function aVictimAndAttacker(c: PoolClient) {
  const victim = await aUser(c, { name: 'Ledger Victim' })
  const attacker = await aUser(c, { name: 'Ledger Attacker' })
  await aLedgerEntry(c, victim, { amount: 100 })
  await aLedgerEntry(c, victim, { amount: 50 })
  await aLedgerEntry(c, attacker, { amount: 25 })
  return {
    victim: { ...victim, role: 'user' as const },
    attacker: { ...attacker, role: 'user' as const },
  }
}

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test('an anonymous caller is refused', async () => {
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        const res = await request(app).get('/api/transactions')
        assert.ok([401, 403].includes(res.status), `answered ${res.status}`)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a body naming another customer does not return their ledger', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { victim, attacker } = await aVictimAndAttacker(c)
      await as(attacker, async () => {
        const res = await request(app)
          .get('/api/transactions')
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ user_id: victim.id }))

        assert.equal(res.status, 200)
        const body = JSON.stringify(res.body ?? '')
        assert.ok(
          !body.includes(victim.id),
          "the response carried the other customer's user_id - the ledger leaked"
        )
        assert.ok(Array.isArray(res.body), 'the ledger answers a list')
        for (const row of res.body) {
          assert.equal(
            row.user_id,
            attacker.id,
            'the response belongs to someone other than the caller'
          )
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a query parameter naming another customer is ignored too', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { victim, attacker } = await aVictimAndAttacker(c)
      await as(attacker, async () => {
        const res = await request(app).get('/api/transactions').query({ user_id: victim.id })
        assert.equal(res.status, 200)
        assert.ok(
          !JSON.stringify(res.body ?? '').includes(victim.id),
          'the query string decided whose ledger was returned'
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('a customer gets their own ledger without naming anyone', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { victim } = await aVictimAndAttacker(c)
      await as(victim, async () => {
        const res = await request(app).get('/api/transactions')
        assert.equal(res.status, 200)
        assert.ok(
          Array.isArray(res.body) && res.body.length > 0,
          'the owner got nothing back - the endpoint is inert, not fixed'
        )
        for (const row of res.body) {
          assert.equal(
            row.user_id,
            victim.id,
            "the owner's own read did not return the owner's rows"
          )
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the response is the whole history, not one row', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { victim } = await aVictimAndAttacker(c)
      await as(victim, async () => {
        const res = await request(app).get('/api/transactions')
        assert.ok(Array.isArray(res.body), 'the ledger must answer a list')
        assert.equal(res.body.length, 2, 'a customer with two ledger rows got a different number')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
