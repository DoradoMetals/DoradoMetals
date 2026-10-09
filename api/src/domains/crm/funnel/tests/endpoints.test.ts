import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import { mockSessions, as } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aLead } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

const asAdmin = <T>(fn: () => Promise<T> | T) =>
  as({ id: TEST_ACTOR.id, name: TEST_ACTOR.name, email: TEST_ACTOR.email, role: 'admin' }, fn)
const asCustomer = <T>(fn: () => Promise<T> | T) =>
  as(
    { id: TEST_CUSTOMER.id, name: TEST_CUSTOMER.name, email: TEST_CUSTOMER.email, role: 'user' },
    fn
  )

test('a customer cannot read the funnel', async () => {
  await inPinnedTransaction(
    async () => {
      await asCustomer(async () => {
        assert.equal((await request(app).get('/api/leads/funnel')).status, 403)
      })
    },
    { actor: TEST_ACTOR.id }
  )
})

test('the funnel is served whole, and `funnel` is never read as a lead id', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      await aLead(c, { phone: '5125557777' })

      await asAdmin(async () => {
        const res = await request(app).get('/api/leads/funnel')
        assert.equal(res.status, 200, JSON.stringify(res.body))

        assert.equal(typeof res.body.open, 'number')
        assert.equal(typeof res.body.unassigned, 'number')
        assert.equal(typeof res.body.never_contacted, 'number')
        assert.equal(typeof res.body.both, 'number')
        assert.equal(typeof res.body.conversion_rate, 'number')
        assert.equal(typeof res.body.response_rate_by_channel.text, 'number')
        assert.equal(typeof res.body.response_rate_by_channel.call, 'number')
        assert.equal(typeof res.body.response_rate_by_channel.email, 'number')
        assert.equal(res.body.conversion_rate_target, 0.25)
        assert.equal(res.body.hours_to_first_contact_target, 4)
        assert.ok(res.body.open >= 1, 'a lead that exists did not count as open')
      })
    },
    { actor: TEST_ACTOR.id }
  )
})
