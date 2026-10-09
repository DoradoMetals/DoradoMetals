import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aLead, anEstimateItem, anUnknownId } from '#shared/testing/builders/index.ts'

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

test('a customer cannot price a lead estimate', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      await asCustomer(async () => {
        assert.equal((await request(app).get(`/api/pricing/lead-estimates/${lead.id}`)).status, 403)
        assert.equal(
          (await request(app).get(`/api/pricing/lead-estimates?lead_ids=${lead.id}`)).status,
          403
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the per-lead read answers the lines and the total', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const lead = await aLead(c)
      const item = await anEstimateItem(c, lead.id, { metal_id: 'Gold', weight: 6 })

      await asAdmin(async () => {
        const res = await request(app).get(`/api/pricing/lead-estimates/${lead.id}`)
        assert.equal(res.status, 200, JSON.stringify(res.body))
        assert.equal(res.body.lead_id, lead.id)
        assert.equal(res.body.items.length, 1)
        assert.equal(res.body.items[0].id, item.id)
        assert.ok(res.body.items[0].value > 0, 'a real gold line priced at nothing')
        assert.ok(res.body.total > 0)
        assert.ok(res.body.spots_at, 'no spot timestamp')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the many-lead read answers one total per asked lead', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const priced = await aLead(c)
      const empty = await aLead(c)
      await anEstimateItem(c, priced.id, { metal_id: 'Gold', weight: 6 })

      await asAdmin(async () => {
        const res = await request(app).get(
          `/api/pricing/lead-estimates?lead_ids=${priced.id},${empty.id}`
        )
        assert.equal(res.status, 200, JSON.stringify(res.body))
        assert.equal(res.body.length, 2)

        const one = res.body.find((row: { lead_id: string }) => row.lead_id === priced.id)
        const none = res.body.find((row: { lead_id: string }) => row.lead_id === empty.id)
        assert.ok(one.total > 0)
        assert.equal(none.total, 0)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('repeated lead_ids parameters work as well as one comma-separated list', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const first = await aLead(c)
      const second = await aLead(c)

      await asAdmin(async () => {
        const res = await request(app).get(
          `/api/pricing/lead-estimates?lead_ids=${first.id}&lead_ids=${second.id}`
        )
        assert.equal(res.status, 200, JSON.stringify(res.body))
        assert.equal(res.body.length, 2)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an id that names no lead is 404, not a zero', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        const res = await request(app).get(`/api/pricing/lead-estimates/${anUnknownId()}`)
        assert.equal(res.status, 404, JSON.stringify(res.body))
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('lead_ids is required, and every value must be a uuid', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(async () => {
        assert.equal((await request(app).get('/api/pricing/lead-estimates')).status, 400)
        assert.equal(
          (await request(app).get('/api/pricing/lead-estimates?lead_ids=nope')).status,
          400
        )
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
